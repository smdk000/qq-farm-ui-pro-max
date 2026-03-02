const { MiniProgramLoginSession } = require('./src/services/qrlogin');
const https = require('https');

async function run() {
  console.log("获取登录二维码...");
  const loginData = await MiniProgramLoginSession.requestLoginCode();
  
  console.log("\n==================================");
  console.log("请扫描打开链接:");
  console.log(loginData.url);
  console.log("==================================\n");

  let ticket = null;
  let uin = null;
  while (true) {
    const status = await MiniProgramLoginSession.queryStatus(loginData.code);
    if (status.status === 'OK') {
      ticket = status.ticket;
      uin = status.uin;
      console.log("扫码成功! Ticket:", ticket, "UIN:", uin);
      break;
    } else if (status.status === 'Used') {
      console.log("二维码失效!");
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const authCode = await MiniProgramLoginSession.getAuthCode(ticket, '1112386029');
  console.log("获取到 AuthCode:", authCode);

  console.log("尝试连接 WebSocket (测试 1: 不带 openID)");
  const res1 = await testWS(authCode, '');
  
  console.log("尝试连接 WebSocket (测试 2: 带 openID=" + uin + ")");
  const res2 = await testWS(authCode, uin);
  
  process.exit(0);
}

function testWS(code, openID) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'gate-obt.nqf.qq.com',
      port: 443,
      path: `/prod/ws?platform=qq&os=iOS&ver=1.6.0.14_20251224&code=${code}&openID=${openID}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
        'Origin': 'https://gate-obt.nqf.qq.com',
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
      }
    };

    const req = https.request(options, (res) => {
      console.log(`HTTP ${res.statusCode}`);
      res.setEncoding('utf8');
      res.on('data', (chunk) => console.log(`BODY: ${chunk}`));
      res.on('end', () => resolve(res.statusCode));
    });
    // handle websocket upgrade
    req.on('upgrade', (res, socket, head) => {
      console.log(`Websocket connected!`);
      socket.destroy();
      resolve(101);
    });
    req.on('error', (e) => {
      console.error(e);
      resolve(0);
    });
    req.end();
  });
}

run();
