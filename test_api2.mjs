import fs from 'fs';

(async () => {
  try {
    const dataRes = await fetch('http://127.0.0.1:3000/api/data?columns=date&limit=10');
    console.log("Status:", dataRes.status);
    const buffer = await dataRes.arrayBuffer();
    console.log("Query returned bytes:", buffer.byteLength);
    fs.writeFileSync('output.ipc', Buffer.from(buffer));
  } catch(e) {
    console.error(e);
  }
})();
