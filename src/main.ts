import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const logger = new Logger('bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

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

  // app.connectMicroservice<MicroserviceOptions>({
  //   transport: Transport.RMQ,
  //   options: {
  //     urls: [
  //       process.env.AMQP_URL ??
  //         'amqps://skijjbdo:n64T0wiyiuT09AirFXHPBaTJffzYYRDM@dog.lmq.cloudamqp.com/skijjbdo',
  //     ],
  //     queue: 'notifications_queue',
  //     queueOptions: {
  //       durable: true,
  //     },
  //   },
  // });
  // Initialize microservice for consumer only
  const configService = app.get(ConfigService);
  const amqpUrl = configService.get<string>('AMQP_URL');
  if (!amqpUrl) {
    logger.error('AMQP_URL not set');
    process.exit(1);
  }
  const urls = amqpUrl.split(',').map((url) => url.trim());
  // app.connectMicroservice({
  //   name:
  //   transport: Transport.RMQ,
  //   options: {
  //     urls,
  //     exchange: 'notifications_exchange',
  //     exchangeType: 'topic',
  //     queue: configService.get<string>('RMQ_QUEUE', 'notifications_queue'),
  //     queueOptions: { durable: true },
  //     routingKey: 'user.*', // Match consumer's routing key
  //     prefetchCount: Number(
  //       configService.get<string | number>('RMQ_PREFETCH_COUNT', 1),
  //     ),
  //     noAck: false,
  //     retryAttempts: Number(
  //       configService.get<string | number>('RMQ_RETRY_ATTEMPTS', 5),
  //     ),
  //     retryDelay: Number(
  //       configService.get<string | number>('RMQ_RETRY_DELAY', 1000),
  //     ),
  //     heartbeat: Number(
  //       configService.get<string | number>('RMQ_HEARTBEAT', 60),
  //     ),
  //     connectionTimeout: Number(
  //       configService.get<string | number>('RMQ_CONNECTION_TIMEOUT', 10000),
  //     ),
  //     consumerOptions: { noAck: false, exclusive: false, durable: true },
  //   },
  // });
  // Add RMQ microservice (consumer)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls,
      queue: 'notifications_queue',
      queueOptions: { durable: true },
      noAck: false, // ✅ manual ack allowed
      prefetchCount: 1,
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
  await app.listen(process.env.PORT || 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
