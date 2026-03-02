const WebSocket = require('ws');
const url = 'wss://gate-obt.nqf.qq.com/prod/ws?platform=qq&os=iOS&ver=1.6.0.14_20251224&code=12345&openID=';
const ws = new WebSocket(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
        'Origin': 'https://gate-obt.nqf.qq.com',
    }
});
ws.on('error', (err) => console.log('Error 1:', err.message));
ws.on('close', (code, reason) => console.log('Close 1:', code, reason.toString()));

const url2 = 'wss://gate-obt.nqf.qq.com/prod/ws?platform=qq&os=iOS&ver=1.6.0.15_20260228&code=12345&openID=';
const ws2 = new WebSocket(url2, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
        'Origin': 'https://gate-obt.nqf.qq.com',
    }
});
ws2.on('error', (err) => console.log('Error 2:', err.message));
ws2.on('close', (code, reason) => console.log('Close 2:', code, reason.toString()));

const url3 = 'wss://gate-obt.nqf.qq.com/prod/ws?platform=qq&os=iOS&code=12345&openID=';
const ws3 = new WebSocket(url3, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
        'Origin': 'https://gate-obt.nqf.qq.com',
    }
});
ws3.on('error', (err) => console.log('Error 3:', err.message));
ws3.on('close', (code, reason) => console.log('Close 3:', code, reason.toString()));
