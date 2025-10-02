// --- Imports ---
const express = require('express');
const http = require('http');             // Standard Node.js module
const path = require('path');             // For working with file paths
const WebSocket = require('ws');          // WebSocket library

// --- Constants ---
const PORT = process.env.PORT || 8080;    // Use environment variable or default
const PUBLIC_DIR = path.join(__dirname, 'public'); // Define public directory path

// --- Initial Data State (In-Memory) ---
// NOTE: This data is lost if the server restarts. Consider a database for persistence.
let currentData = {
    amount: "LOADING...", // Ensure these match initial values in public/GLOBALPAY.html
    name: "LOADING..."
};

// --- Application Setup ---
const app = express();                      // Create Express application
const server = http.createServer(app);      // Create HTTP server using Express app

// --- Middleware ---
// Serve static files (HTML, CSS, JS) from the 'public' directory
app.use(express.static(PUBLIC_DIR));

// --- Routes ---
// Serve the main HTML file on the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'GLOBALPAY.html'));
});

// --- WebSocket Server Setup ---
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the HTTP server
const clients = new Set();                    // Keep track of connected clients

console.log('WebSocket server configured...');

wss.on('connection', (ws, req) => {
    // Optional: Log client IP (consider privacy implications)
    // const clientIp = req.socket.remoteAddress;
    // console.log(`Client connected via WebSocket from ${clientIp}`);
    console.log('Client connected via WebSocket');
    clients.add(ws); // Add new client to our set

    // Send the current data state to the newly connected client
    try {
        ws.send(JSON.stringify({
            type: 'initial_state',
            payload: currentData
        }));
        console.log('Sent initial state to new WebSocket client.');
    } catch (error) {
        console.error('Failed to send initial state via WebSocket:', error);
        // Close the connection if initial state fails? Maybe.
        // ws.close();
        // clients.delete(ws);
    }

    // Handle messages received from this specific client
    ws.on('message', (message) => {
        // Use try-catch for message processing as it might be invalid
        try {
            // Ensure message is a string before parsing (ws library usually handles buffer conversion)
            const messageString = message.toString();
            console.log('WebSocket received message:', messageString);
            const parsedMessage = JSON.parse(messageString);

            // Process 'update' messages
            // NOTE: Add validation/sanitization here for production!
            if (parsedMessage.type === 'update' && parsedMessage.payload) {
                const { field, value } = parsedMessage.payload;

                // Basic check: does the field exist in our data structure?
                // More robust validation would check allowed fields, data types, lengths etc.
                if (currentData.hasOwnProperty(field)) {
                    currentData[field] = value; // Update server's state
                    console.log(`Updated server state: ${field} = ${value}`);

                    // Broadcast the update to ALL connected clients
                    broadcast({
                        type: 'update',
                        payload: { field, value }
                    }, ws); // Optional: pass 'ws' if you want to exclude sender

                } else {
                    console.warn(`Received update for unknown field: ${field}`);
                    // Optionally send an error back to the client
                    // ws.send(JSON.stringify({ type: 'error', message: `Unknown field: ${field}` }));
                }
            } else {
                console.log(`Received non-update message type or invalid format: ${parsedMessage.type || 'unknown'}`);
            }

        } catch (error) {
            console.error('Failed to parse WebSocket message or process update:', error);
            // Optionally inform the client about the error
            // ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format received.' }));
        }
    });

    // Handle client disconnection for this specific client
    ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected: code=${code}, reason=${reason || 'N/A'}`);
        clients.delete(ws); // Remove client from the set
        // Optional: Broadcast presence update if needed
    });

    // Handle WebSocket errors for this specific client
    ws.on('error', (error) => {
        console.error('WebSocket error on client:', error);
        // Close connection and remove client on error
        clients.delete(ws);
        ws.close(); // Ensure connection is closed
    });
});

// --- Helper Functions ---
// Function to broadcast a message to all connected clients
// Added optional 'sender' parameter to exclude the sender if desired
function broadcast(message, sender = null) {
    const messageString = JSON.stringify(message);
    console.log(`Broadcasting WebSocket message: ${messageString}`);
    clients.forEach((client) => {
        // Check if client is different from the sender (if sender is provided)
        // and if the connection is still open
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(messageString, (err) => {
                if (err) {
                    console.error(`Failed to send WebSocket message to a client:`, err);
                    // Optional: Clean up disconnected clients found during broadcast
                    // clients.delete(client);
                    // client.terminate(); // Force close if send fails badly
                }
            });
        } else if (client === sender) {
            // console.log('Skipping broadcast to sender');
        } else if (client.readyState !== WebSocket.OPEN) {
             console.warn('Found client with non-OPEN state during broadcast, removing.');
             clients.delete(client); // Clean up stale clients
        }
    });
}

// --- Server Error Handling ---
server.on('error', (error) => {
    console.error('--- HTTP Server Error ---');
    if (error.syscall !== 'listen') {
        throw error;
    }
    // Handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(`Port ${PORT} requires elevated privileges.`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`Port ${PORT} is already in use.`);
            process.exit(1);
            break;
        default:
            throw error;
    }
});

// --- Start Server ---
// *** This MUST be at the end, after all setup is done ***
server.listen(PORT, () => {
    console.log(`\n🚀 Server ready!`);
    console.log(`   HTTP server listening on port ${PORT}`);
    console.log(`   Serving static files from: ${PUBLIC_DIR}`);
    console.log(`   Access application at: http://localhost:${PORT}`);
    console.log(`   WebSocket server attached and listening.`);
});