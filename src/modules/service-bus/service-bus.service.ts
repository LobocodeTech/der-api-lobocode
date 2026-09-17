import { Injectable, Logger } from '@nestjs/common';
import { ServiceBusClient } from '@azure/service-bus';

export interface TagData {
  tagId: string;
  timestamp: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  sensorData?: {
    temperature: number;
    humidity: number;
    batteryLevel: number;
  };
  metadata?: Record<string, any>;
}

@Injectable()
export class ServiceBusService {
  private readonly logger = new Logger(ServiceBusService.name);
  private readonly connectionString =
    process.env.SERVICEBUS_CONNECTION_STRING ?? '';
  private readonly queueName =
    process.env.SERVICEBUS_QUEUE_NAME ?? 'tags_ingest';

  private validarConfiguracao(): void {
    if (!this.connectionString) {
      throw new Error('SERVICEBUS_CONNECTION_STRING nao configurada.');
    }
  }

  /**
   * Envia dados de tag para o Azure Service Bus
   */
  async enviarDadosTag(tagData: TagData | any): Promise<boolean> {
    this.validarConfiguracao();
    const sbClient = new ServiceBusClient(this.connectionString);
    const sender = sbClient.createSender(this.queueName);

    try {
      const message = {
        body: {
          ...tagData,
          timestamp: tagData.timestamp || new Date().toISOString(),
        },
        applicationProperties: {
          origem: 'ifraseg-engine',
          versao: '1.0.0',
          ...tagData.metadata,
        },
      };

      this.logger.log(`📤 Enviando dados da tag: ${tagData.tagId}`);
      this.logger.debug(
        'Dados da mensagem:',
        JSON.stringify(message.body, null, 2),
      );

      await sender.sendMessages(message);

      this.logger.log(`✅ Dados da tag ${tagData.tagId} enviados com sucesso`);
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar dados da tag ${tagData.tagId}:`,
        error,
      );
      return false;
    } finally {
      await sender.close();
      await sbClient.close();
    }
  }

  /**
   * Envia múltiplas mensagens de tag
   */
  async enviarMultiplasTags(
    tagsData: TagData[],
  ): Promise<Array<{ tagId: string; success: boolean; error?: string }>> {
    const results: Array<{ tagId: string; success: boolean; error?: string }> =
      [];

    for (const tagData of tagsData) {
      try {
        const success = await this.enviarDadosTag(tagData);
        results.push({
          tagId: tagData.tagId,
          success,
        });
      } catch (error) {
        results.push({
          tagId: tagData.tagId,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Testa a conectividade com o Service Bus
   */
  async testarConectividade(): Promise<boolean> {
    this.validarConfiguracao();
    const sbClient = new ServiceBusClient(this.connectionString);

    try {
      const sender = sbClient.createSender(this.queueName);
      await sender.close();
      await sbClient.close();

      this.logger.log('✅ Conectividade com Service Bus testada com sucesso');
      return true;
    } catch (error) {
      this.logger.error('❌ Erro na conectividade com Service Bus:', error);
      return false;
    }
  }

  /**
   * Envia dados de teste
   */
  async enviarDadosTeste(): Promise<boolean> {
    const dadosTeste: TagData = {
      tagId: `TAG_TESTE_${Date.now()}`,
      timestamp: new Date().toISOString(),
      location: {
        latitude: -23.5505,
        longitude: -46.6333,
      },
      sensorData: {
        temperature: Math.random() * 30 + 10,
        humidity: Math.random() * 50 + 30,
        batteryLevel: Math.floor(Math.random() * 100),
      },
      metadata: {
        tipo: 'teste',
        origem: 'ifraseg-engine',
      },
    };
    const dadosTeste2 = {
      captureId: 88,
      info: {
        product: [
          {
            description:
              'Cápsula de Café Nespresso linha edição limitada com notas de gergelim torrado e pipoca para sua cafeteira Vertuo! Não perca!',
            image:
              'https://www.nespresso.com/shared_res/agility/global/coffees/vl/sku-main-info-product/festive-peanut-roasted-sesame-vl_2x.png?impolicy=small&imwidth=600&imdensity=1',
            url: 'https://www.nespresso.com/br/pt/order/capsules/vertuo/cafe-vertuo-peanut-roasted-sesame-flavour',
            name: 'Peanut & Roasted Sesame',
            price: 'R$ 47,00',
          },
        ],
      },
      channels: [],
      location:
        'https://www.nespresso.com/br/pt/order/capsules/vertuo/cafe-vertuo-peanut-roasted-sesame-flavour',
      uuid: 'FC9B5739-4FB0-4DD5-8157-084BFEA10C20',
      session: 'bdb119e8-41e7-460e-b489-7ac51d511321',
      device: 'Desktop',
      isMobile: false,
    };
    return this.enviarDadosTag(dadosTeste2);
  }
}
