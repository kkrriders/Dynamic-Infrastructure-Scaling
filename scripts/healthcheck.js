#!/usr/bin/env node

const http = require('http');
const { URL } = require('url');

// Load environment variables
require('dotenv').config();

// Define the health check URL
const healthCheck = () => {
  return new Promise((resolve, reject) => {
    const PORT = process.env.PORT || 3000;
    const HEALTH_CHECK_PATH = '/health';
    const url = `http://localhost:${PORT}${HEALTH_CHECK_PATH}`;
    
    console.log(`Performing health check on ${url}`);
    
    try {
      const parsedUrl = new URL(url);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: 'GET',
        timeout: 5000 // 5 seconds timeout
      };

      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response = JSON.parse(data);
              if (response.status === 'OK') {
                console.log('Health check successful:', response);
                resolve(true);
              } else {
                console.error('Health check failed: Unexpected response:', response);
                resolve(false);
              }
            } catch (error) {
              console.error('Health check failed: Invalid JSON response:', error.message);
              resolve(false);
            }
          } else {
            console.error(`Health check failed: Status code ${res.statusCode}`);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.error('Health check failed:', error.message);
        resolve(false);
      });

      req.on('timeout', () => {
        console.error('Health check timed out');
        req.destroy();
        resolve(false);
      });

      req.end();
    } catch (error) {
      console.error('Health check failed:', error.message);
      resolve(false);
    }
  });
};

// Execute the health check
healthCheck()
  .then(isHealthy => {
    process.exit(isHealthy ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error during health check:', error);
    process.exit(1);
  }); 