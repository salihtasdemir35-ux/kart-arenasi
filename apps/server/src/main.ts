import path from 'node:path';
import { createKartServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const root = process.cwd();
const srv = createKartServer({
  port,
  dataFile: process.env.DATA_FILE ?? path.join(root, 'data', 'kart-arenasi.json'),
  clientDist: process.env.CLIENT_DIST ?? path.join(root, 'apps', 'client', 'dist'),
  botDelayMs: Number(process.env.BOT_DELAY_MS ?? 700),
  graceMs: Number(process.env.RECONNECT_GRACE_MS ?? 60000),
  dictDir: process.env.DICT_DIR ?? path.join(root, 'apps', 'client', 'public', 'dict'),
});
srv.listen(port).then((p) => console.log(`Kart Arenası sunucusu hazır: http://localhost:${p}`));
const stop = () => srv.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
