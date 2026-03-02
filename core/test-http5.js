const https = require('https');

const tests = ['openId', 'OPENID', 'OpenId', 'Openid'];

function testParam(paramName) {
  const options = {
    hostname: 'gate-obt.nqf.qq.com',
    port: 443,
    path: `/prod/ws?platform=qq&os=iOS&ver=1.6.0.14_20251224&code=12345&${paramName}=12345`,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://gate-obt.nqf.qq.com',
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }
  };

  const req = https.request(options, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => console.log(`${paramName}: ${res.statusCode} ${chunk}`));
  });
  req.end();
}

tests.forEach(testParam);
