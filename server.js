const http = require('http');
const { vote } = require('./vote');

const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  if (req.url === '/vote' && req.method === 'POST') {
    console.log('Received vote request...');
    
    try {
      const result = await vote();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: result.success, 
        rateLimited: result.rateLimited || false,
        timestamp: new Date().toISOString() 
      }));
    } catch (error) {
      console.error('Vote error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, rateLimited: false, error: error.message }));
    }
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Vote server running on port ${PORT}`);
  console.log('POST /vote - Submit a vote');
  console.log('GET /health - Health check');
});
