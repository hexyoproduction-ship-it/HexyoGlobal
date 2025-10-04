// Wait for the DOM to be fully loaded before running any script logic
document.addEventListener('DOMContentLoaded', () => {

    // --- Get DOM Elements (Selected Once) ---
    const buyButton = document.getElementById('login-btn');
    const sellButton = document.getElementById('register-btn');
    const overlay = document.getElementById('popup-overlay');
    const popup = document.getElementById('verification-popup');
    const acceptButton = document.getElementById('accept-btn');
    const declineButton = document.getElementById('decline-btn');
    const popupMessageElement = document.getElementById('popup-message'); // Renamed to avoid conflict
    const popupActionSpan = popup.querySelector('.popup-action');
    const popupAmountSpan = popup.querySelector('.popup-amount');

    // Elements for dynamic data in popup and potentially for editing
    const amountElement = document.querySelector('.info-card__content[data-field="amount"]'); // Use data-field selector
    const nameElement = document.querySelector('.info-card__content[data-field="name"]');   // Select name field if needed
    const currencyElement = document.querySelector('.info-card:nth-child(1) .info-card__meta'); // Assuming currency is in first card meta

    // Elements for real-time editing
    const editableElements = document.querySelectorAll('.info-card__content[data-field]');

    // --- State Variables ---
    let currentPopupAction = null; // To store 'Buy' or 'Sell' for the popup
    let popupRedirectUrl = null; // To store the target URL for popup actions (currently overridden on accept)
    let originalEditValue = ''; // Store the original value before editing a field
    let ws = null; // WebSocket connection variable

    // --- Popup Functions ---
    function openPopup(action) {
        currentPopupAction = action;
        const amount = amountElement ? amountElement.textContent.trim() : 'N/A';
        const currency = currencyElement ? currencyElement.textContent.trim() : 'NGN'; // Default currency

        // Update popup content using spans if they exist
        if (popupActionSpan) popupActionSpan.textContent = action;
        if (popupAmountSpan) popupAmountSpan.textContent = `${amount} ${currency}`;

        // Fallback if spans aren't found (or you prefer innerHTML)
        if (!popupActionSpan || !popupAmountSpan && popupMessageElement) {
             popupMessageElement.innerHTML = `Verify it's your Account proceeding for Amount:<span class="popup-amount">${amount}</span>.`;
        }


        // Define potential redirect URLs (NOTE: Currently overridden by hardcoded URL in accept listener)
        if (action === 'Buy') {
            popupRedirectUrl = '/buy-confirmation-page'; // Example Buy confirmation URL
        } else if (action === 'Sell') {
            popupRedirectUrl = '/sell-confirmation-page'; // Example Sell confirmation URL
        } else {
            popupRedirectUrl = '/error-page'; // Fallback
        }

        // Show the popup and overlay
        if (overlay) overlay.classList.add('active');
        if (popup) {
            popup.classList.add('active');
            popup.setAttribute('aria-hidden', 'false');
        }
        document.body.classList.add('popup-open'); // Prevent body scroll

        // Focus the first interactive element (good for accessibility)
        if (acceptButton) acceptButton.focus();
    }

    function closePopup() {
        if (overlay) overlay.classList.remove('active');
        if (popup) {
             popup.classList.remove('active');
             popup.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('popup-open'); // Allow body scroll
        currentPopupAction = null;
        popupRedirectUrl = null;
    }

    // --- WebSocket Functions ---
    function connectWebSocket() {
        // Calculate dynamic WebSocket URL based on page protocol and hostname
        const isSecure = window.location.protocol === 'https:';
        const wsProtocol = isSecure ? 'wss' : 'ws';
        // Use the same hostname the page is served from, standard ports are implicit
        const socketUrl = `${wsProtocol}://${window.location.hostname}:8080`;

        console.log(`Attempting to connect WebSocket via ${socketUrl}...`);

        // Close existing connection if trying to reconnect
        if (ws && ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }

        ws = new WebSocket(socketUrl);

        ws.onopen = () => {
            console.log('WebSocket connection established.');
            // Optional: Handle successful connection state if needed
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('Message received:', message);

                // Handle initial state on connection
                if (message.type === 'initial_state' && message.payload) {
                    Object.entries(message.payload).forEach(([field, value]) => {
                        const elementToUpdate = document.querySelector(`.info-card__content[data-field="${field}"]`);
                        if (elementToUpdate) {
                            elementToUpdate.textContent = value;
                        }
                    });
                    console.log('Initial state received and applied.');
                }
                // Handle real-time updates from server
                else if (message.type === 'update' && message.payload) {
                    const { field, value } = message.payload;
                    const elementToUpdate = document.querySelector(`.info-card__content[data-field="${field}"]`);
                    if (elementToUpdate) {
                        // Only update if the content is different AND the element isn't currently being edited by *this* user
                        const isEditing = elementToUpdate.getAttribute('contenteditable') === 'true';
                        if (elementToUpdate.textContent !== value && !isEditing) {
                            elementToUpdate.textContent = value;
                            console.log(`Updated field "${field}" to "${value}"`);
                        } else if (isEditing) {
                           console.log(`Skipping update for field "${field}" as it's being edited locally.`);
                        }
                    }
                }

            } catch (error) {
                console.error('Failed to parse message or update UI:', error, event.data);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            // Maybe display a user-friendly connection error message
        };

        ws.onclose = (event) => {
            console.log(`WebSocket connection closed: ${event.code} ${event.reason}. Reconnecting in 5 seconds...`);
            // Simple reconnection logic
            setTimeout(connectWebSocket, 5000);
        };
    }

    // --- Editing Functions ---
    const finishEditing = (element) => {
        if (!element || element.getAttribute('contenteditable') !== 'true') return; // Check if element exists and is editable

        element.setAttribute('contenteditable', 'false');
        const newValue = element.textContent.trim();
        const field = element.dataset.field;

        // Revert if empty or unchanged
        if (newValue === '' || newValue === originalEditValue) {
            element.textContent = originalEditValue;
            console.log(`Edit cancelled or no change for field "${field}"`);
            return;
        }

        // Send update via WebSocket if connected and value changed
        if (ws && ws.readyState === WebSocket.OPEN) {
            const updateMessage = {
                type: 'update',
                payload: {
                    field: field,
                    value: newValue
                }
            };
            ws.send(JSON.stringify(updateMessage));
            console.log(`Sent update for field "${field}": ${newValue}`);
        } else {
            // Handle disconnected state - revert change? Show error? Queue update?
            console.warn('WebSocket not open. Update not sent. Reverting change.');
            element.textContent = originalEditValue;
        }
    };

    // --- Attach Event Listeners ---

    // Popup Listeners
    if (buyButton) {
        buyButton.addEventListener('click', () => openPopup('Buy'));
    } else {
        console.error("Buy button (#login-btn) not found.");
    }

    if (sellButton) {
        sellButton.addEventListener('click', () => openPopup('Sell'));
    } else {
        console.error("Sell button (#register-btn) not found.");
    }

    if (acceptButton) {
        acceptButton.addEventListener('click', () => {
            console.log('Accepted action:', currentPopupAction);
            // NOTE: This redirects unconditionally to a hardcoded URL.
            // Remove or modify if you want to use the dynamic popupRedirectUrl.
            window.location.replace('https://hexyo-production.vercel.app/');
            // hidePopup(); // Hide popup happens implicitly due to page navigation
        });
    } else {
        console.error("Accept button (#accept-btn) not found.");
    }

    if (declineButton) {
        declineButton.addEventListener('click', closePopup);
    } else {
        console.error("Decline button (#decline-btn) not found.");
    }

    if (overlay) {
        overlay.addEventListener('click', closePopup); // Close if overlay is clicked
    }

    document.addEventListener('keydown', (event) => { // Close popup with Escape key
        if (event.key === 'Escape' && popup && popup.classList.contains('active')) {
            closePopup();
        }
    });

    // Editing Listeners
    editableElements.forEach(element => {
        // Double-click to start editing
        element.addEventListener('dblclick', () => {
            // Prevent editing if already editing or WebSocket not ready
            if (element.getAttribute('contenteditable') === 'true' || !ws || ws.readyState !== WebSocket.OPEN) {
                console.warn('Cannot edit: Already editing or WebSocket not open.');
                return;
            }
            originalEditValue = element.textContent; // Store current value
            element.setAttribute('contenteditable', 'true');
            element.focus(); // Place cursor in the element
            // Optional: Select all text for easier editing
             try {
                 const range = document.createRange();
                 range.selectNodeContents(element);
                 const sel = window.getSelection();
                 sel.removeAllRanges();
                 sel.addRange(range);
             } catch(e) { /* Ignore selection errors */ }
        });

        // Finish editing on blur (losing focus)
        element.addEventListener('blur', () => {
            // Use a slight delay because blur might fire before a click on another button
            setTimeout(() => finishEditing(element), 100);
        });

        // Finish editing on Enter key, prevent adding newline
        // Cancel editing on Escape key
        element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent newline
                finishEditing(element);
            } else if (event.key === 'Escape') {
                element.textContent = originalEditValue; // Restore original
                element.setAttribute('contenteditable', 'false'); // Stop editing immediately
                element.blur(); // Remove focus
                console.log(`Edit cancelled by Escape for field "${element.dataset.field}"`);
            }
        });
    });

    // --- Initial Connection ---
    connectWebSocket(); // Start the WebSocket connection process

}); // End DOMContentLoaded