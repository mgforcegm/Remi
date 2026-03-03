import { Kafka, Producer, logLevel } from 'kafkajs';
import { logger } from '../utils/logger';

let producer: Producer | null = null;

function createKafkaClient(): Kafka {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  const clientId = process.env.KAFKA_CLIENT_ID || 'remi-dispatcher';

  const config: ConstructorParameters<typeof Kafka>[0] = {
    clientId,
    brokers,
    logLevel: logLevel.WARN,
  };

  // SASL auth (if configured)
  if (process.env.KAFKA_SASL_USERNAME && process.env.KAFKA_SASL_PASSWORD) {
    config.sasl = {
      mechanism: 'plain',
      username: process.env.KAFKA_SASL_USERNAME,
      password: process.env.KAFKA_SASL_PASSWORD,
    };
  }

  if (process.env.KAFKA_SSL === 'true') {
    config.ssl = true;
  }

  return new Kafka(config);
}

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    const kafka = createKafkaClient();
    producer = kafka.producer();
    await producer.connect();
    logger.info('Kafka producer connected');
  }
  return producer;
}

export async function publishToKafka(
  topic: string,
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  const p = await getProducer();

  await p.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(value),
        headers: {
          'content-type': 'application/json',
          source: 'remi-dispatcher',
        },
      },
    ],
  });

  logger.info({ topic, key }, 'Published message to Kafka');
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('Kafka producer disconnected');
  }
}
