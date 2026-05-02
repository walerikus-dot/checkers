import { NestFactory } from '@nestjs/core';
import { GuestAppModule } from './guest/guest-app.module';

async function bootstrap() {
  const app = await NestFactory.create(GuestAppModule);

  app.enableCors({
    origin: (_origin, cb) => cb(null, true),
    credentials: true,
  });

  const port = process.env.GUEST_PORT || 3000;
  await app.listen(port);
  console.log(`Guest relay running on http://localhost:${port} (WebSocket: /guest)`);
}
bootstrap();
