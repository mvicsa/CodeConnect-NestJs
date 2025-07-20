import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('Backend API')
    .setDescription('Fullstack Project API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Initialize microservice for consumer only
  const configService = app.get(ConfigService);
  const amqpUrl = configService.get<string>('AMQP_URL');
  if (!amqpUrl) {
    logger.error('AMQP_URL not set');
    process.exit(1);
  }
  const urls = amqpUrl.split(',').map((url) => url.trim());

  // app.connectMicroservice<MicroserviceOptions>({
  //   transport: Transport.RMQ,
  //   options: {
  //     urls,
  //     queue: 'notifications_queue',
  //     queueOptions: {
  //       durable: true,
  //       // exclusive: true, // ✅ move it here
  //     },
  //     noAck: false, // ✅ manual ack allowed
  //     prefetchCount: 1,
  //     persistent: true,
  //     routingKey: '#', // wildcard to match anything

  //   },
  // });
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls,
      exchange: 'notifications_exchange',
      exchangeType: 'topic',
      queue: configService.get<string>('RMQ_QUEUE', 'notifications_queue'),
      queueOptions: { durable: true  },
      routingKey: '#',
      noAck: false,
      prefetchCount: Number(configService.get('RMQ_PREFETCH_COUNT', 1)),
    },
  });
  await app.startAllMicroservices();
  logger.log(`✅ RabbitMQ connected to queue: ${process.env.RMQ_QUEUE}`);
  // Log environment variables
  logger.log(
    `Environment Variables: ${JSON.stringify({
      AMQP_URL: configService.get<string>('AMQP_URL'),
      RMQ_QUEUE: configService.get<string>('RMQ_QUEUE'),
      RMQ_PREFETCH_COUNT: configService.get<string>('RMQ_PREFETCH_COUNT'),
    })}`,
  );

  // Start server
  await app.listen(process.env.PORT || 5000);
}
bootstrap();
