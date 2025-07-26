import { Module, Logger } from '@nestjs/common';
import {
  ClientsModule,
  Transport,
  ClientProviderOptions,
} from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      // Producer configuration (for client.emit)
      {
        name: 'RABBITMQ_PRODUCER',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: async (configService: ConfigService) => {
          const logger = new Logger('RabbitMQModule:Producer');
          const amqpUrl = configService.get<string>('AMQP_URL');
          if (!amqpUrl) {
            throw new Error('AMQP_URL environment variable is not set');
          }
          const urls = amqpUrl.split(',').map((url) => url.trim());
          if (urls.length === 0 || urls.some((url) => !url)) {
            throw new Error('AMQP_URL contains invalid or empty URLs');
          }

          const retryAttemptsRaw = configService.get<string | number>(
            'RMQ_RETRY_ATTEMPTS',
            5,
          );
          const retryAttempts = Number(retryAttemptsRaw);
          if (isNaN(retryAttempts) || retryAttempts < 0) {
            throw new Error(
              'RMQ_RETRY_ATTEMPTS must be a valid non-negative number',
            );
          }

          const retryDelayRaw = configService.get<string | number>(
            'RMQ_RETRY_DELAY',
            1000,
          );
          const retryDelay = Number(retryDelayRaw);
          if (isNaN(retryDelay) || retryDelay < 0) {
            throw new Error(
              'RMQ_RETRY_DELAY must be a valid non-negative number',
            );
          }

          const heartbeatRaw = configService.get<string | number>(
            'RMQ_HEARTBEAT',
            60,
          );
          const heartbeat = Number(heartbeatRaw);
          if (isNaN(heartbeat) || heartbeat < 0) {
            throw new Error(
              'RMQ_HEARTBEAT must be a valid non-negative number',
            );
          }

          const connectionTimeoutRaw = configService.get<string | number>(
            'RMQ_CONNECTION_TIMEOUT',
            10000,
          );
          const connectionTimeout = Number(connectionTimeoutRaw);
          if (isNaN(connectionTimeout) || connectionTimeout < 0) {
            throw new Error(
              'RMQ_CONNECTION_TIMEOUT must be a valid non-negative number',
            );
          }

          const config = {
            name: 'RABBITMQ_PRODUCER',
            transport: Transport.RMQ,
            options: {
              urls,
              exchange: 'notifications_exchange',
              exchangeType: 'topic',
              queue: configService.get<string>(
                'RMQ_QUEUE',
                'notifications_queue',
              ),
              queueOptions: {
                durable: true,
              },
              retryAttempts,
              retryDelay,
              heartbeat,
              connectionTimeout,
            },
          };
          
          return config as ClientProviderOptions;
        },
      },
      // Consumer configuration (for @EventPattern)
      // {
      //   name: 'RABBITMQ_CONSUMER',
      //   imports: [ConfigModule],
      //   inject: [ConfigService],
      //   useFactory: async (configService: ConfigService) => {
      //     const logger = new Logger('RabbitMQModule:Consumer');
      //     const amqpUrl = configService.get<string>('AMQP_URL');
      //     if (!amqpUrl) {
      //       throw new Error('AMQP_URL environment variable is not set');
      //     }
      //     const urls = amqpUrl.split(',').map((url) => url.trim());
      //     if (urls.length === 0 || urls.some((url) => !url)) {
      //       throw new Error('AMQP_URL contains invalid or empty URLs');
      //     }

      //     const prefetchCountRaw = configService.get<string | number>(
      //       'RMQ_PREFETCH_COUNT',
      //       1,
      //     );
      //     const prefetchCount = Number(prefetchCountRaw);
      //     if (isNaN(prefetchCount) || prefetchCount < 0) {
      //       throw new Error(
      //         'RMQ_PREFETCH_COUNT must be a valid non-negative number',
      //       );
      //     }

      //     const retryAttemptsRaw = configService.get<string | number>(
      //       'RMQ_RETRY_ATTEMPTS',
      //       5,
      //     );
      //     const retryAttempts = Number(retryAttemptsRaw);
      //     if (isNaN(retryAttempts) || retryAttempts < 0) {
      //       throw new Error(
      //         'RMQ_RETRY_ATTEMPTS must be a valid non-negative number',
      //       );
      //     }

      //     const retryDelayRaw = configService.get<string | number>(
      //       'RMQ_RETRY_DELAY',
      //       1000,
      //     );
      //     const retryDelay = Number(retryDelayRaw);
      //     if (isNaN(retryDelay) || retryDelay < 0) {
      //       throw new Error(
      //         'RMQ_RETRY_DELAY must be a valid non-negative number',
      //       );
      //     }

      //     const heartbeatRaw = configService.get<string | number>(
      //       'RMQ_HEARTBEAT',
      //       60,
      //     );
      //     const heartbeat = Number(heartbeatRaw);
      //     if (isNaN(heartbeat) || heartbeat < 0) {
      //       throw new Error(
      //         'RMQ_HEARTBEAT must be a valid non-negative number',
      //       );
      //     }

      //     const connectionTimeoutRaw = configService.get<string | number>(
      //       'RMQ_CONNECTION_TIMEOUT',
      //       10000,
      //     );
      //     const connectionTimeout = Number(connectionTimeoutRaw);
      //     if (isNaN(connectionTimeout) || connectionTimeout < 0) {
      //       throw new Error(
      //         'RMQ_CONNECTION_TIMEOUT must be a valid non-negative number',
      //       );
      //     }

      //     const config = {
      //       name: 'RABBITMQ_CONSUMER',
      //       transport: Transport.RMQ,
      //       options: {
      //         urls,
      //         exchange: 'notifications_exchange',
      //         exchangeType: 'topic',
      //         queue: configService.get<string>(
      //           'RMQ_QUEUE',
      //           'notifications_queue',
      //         ),
      //         queueOptions: {
      //           durable: true,
      //         },
      //         // Bind queue to multiple routing keys
      //         routingKey: '#', // Wildcard to match user.login, user.register, etc.
      //         prefetchCount,
      //         noAck: false, // Enable manual acknowledgments
      //         retryAttempts,
      //         retryDelay,
      //         heartbeat,
      //         connectionTimeout,
      //         consumerOptions: {
      //           noAck: false, // Reinforce manual acknowledgment
      //           exclusive: false,
      //           durable: true,
      //         },
      //       },
      //     };

      //     logger.log(
      //       `Consumer config: ${JSON.stringify(config.options, null, 2)}`,
      //     );
      //     return config as ClientProviderOptions;
      //   },
      // },
    ]),
  ],
  exports: [ClientsModule],
})
export class RabbitMQModule {}
