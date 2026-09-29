const { spawn } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();

  console.log(`Using in-memory MongoDB: ${uri}`);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGODB_URI: uri,
      PORT: process.env.PORT || '3000'
    }
  });

  child.on('exit', async (code, signal) => {
    console.log(`Server exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
    await mongo.stop();
    process.exit(code ?? 0);
  });

  process.on('SIGINT', async () => {
    child.kill('SIGINT');
    await mongo.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    child.kill('SIGTERM');
    await mongo.stop();
    process.exit(0);
  });
})();
