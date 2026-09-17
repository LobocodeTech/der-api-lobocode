import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentRecipientType, DocumentStatus, Roles } from '@prisma/client';
import { NotificationHelper } from '../notifications/notification.helper';
// FilesService não é necessário diretamente, usamos apenas Prisma para buscar arquivos

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHelper: NotificationHelper,
  ) {}

  /**
   * Cria um novo documento
   */
  async create(
    createDocumentDto: CreateDocumentDto,
    senderId: string,
    companyId?: string,
  ) {
    // Verificar se o arquivo existe
    const file = await this.prisma.file.findUnique({
      where: { id: createDocumentDto.fileId },
    });

    if (!file) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    // Verificar se o arquivo pertence à mesma empresa
    if (companyId && file.companyId !== companyId) {
      throw new BadRequestException('Arquivo não pertence à mesma empresa');
    }

    // Criar o documento
    const document = await this.prisma.document.create({
      data: {
        recipientType: createDocumentDto.recipientType,
        description: createDocumentDto.description,
        fileId: createDocumentDto.fileId,
        senderId,
        companyId,
        status: DocumentStatus.PENDING,
      },
      include: {
        file: true,
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Documento criado: ${document.id}`);

    // Enviar notificações para os destinatários
    await this.enviarNotificacaoDocumento(document, senderId, companyId);

    return document;
  }

  /**
   * Lista documentos enviados pelo usuário
   */
  async findSent(senderId: string, companyId?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: any = {
      senderId,
      deletedAt: null,
    };

    if (companyId) {
      where.companyId = companyId;
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          file: {
            select: {
              id: true,
              originalName: true,
              fileName: true,
              size: true,
              mimeType: true,
              url: true,
            },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data: documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Lista documentos recebidos pelo usuário baseado no role
   */
  async findReceived(
    userRole: Roles,
    companyId?: string,
    page = 1,
    limit = 20,
  ) {
    // Determinar o(s) tipo(s) de destinatário baseado no role
    let recipientTypes: DocumentRecipientType[] = [];

    if (userRole === Roles.ADMIN || userRole === Roles.SYSTEM_ADMIN) {
      recipientTypes = [
        DocumentRecipientType.ADMIN,
        DocumentRecipientType.HR,
        DocumentRecipientType.SUPERVISOR,
      ];
    } else if (userRole === Roles.C2C) {
      recipientTypes = [DocumentRecipientType.SUPERVISOR];
    } else if (userRole === Roles.FIELD_TEAM) {
      recipientTypes = [DocumentRecipientType.HR];
    } else {
      // Usuário sem permissão para receber documentos
      return {
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    const skip = (page - 1) * limit;

    const where: any = {
      recipientType: { in: recipientTypes },
      deletedAt: null,
    };

    if (companyId) {
      where.companyId = companyId;
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          file: {
            select: {
              id: true,
              originalName: true,
              fileName: true,
              size: true,
              mimeType: true,
              url: true,
            },
          },
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data: documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Busca um documento por ID
   */
  async findOne(id: string, userId?: string, companyId?: string) {
    const where: any = {
      id,
      deletedAt: null,
    };

    const document = await this.prisma.document.findFirst({
      where,
      include: {
        file: true,
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Documento não encontrado');
    }

    // Verificar se pertence à mesma empresa
    if (companyId && document.companyId !== companyId) {
      throw new BadRequestException('Documento não pertence à mesma empresa');
    }

    return document;
  }

  /**
   * Atualiza o status de um documento
   */
  async updateStatus(
    id: string,
    status: DocumentStatus,
    userId?: string,
    companyId?: string,
  ) {
    const document = await this.findOne(id, userId, companyId);

    const updated = await this.prisma.document.update({
      where: { id },
      data: { status },
      include: {
        file: {
          select: {
            id: true,
            originalName: true,
            fileName: true,
            size: true,
            mimeType: true,
            url: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Status do documento ${id} atualizado para ${status}`);
    return updated;
  }

  /**
   * Atualiza um documento
   */
  async update(
    id: string,
    updateDocumentDto: UpdateDocumentDto,
    userId?: string,
    companyId?: string,
  ) {
    await this.findOne(id, userId, companyId);

    const updated = await this.prisma.document.update({
      where: { id },
      data: updateDocumentDto,
      include: {
        file: {
          select: {
            id: true,
            originalName: true,
            fileName: true,
            size: true,
            mimeType: true,
            url: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Documento ${id} atualizado`);
    return updated;
  }

  /**
   * Remove um documento (soft delete)
   */
  async remove(id: string, userId?: string, companyId?: string) {
    await this.findOne(id, userId, companyId);

    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Documento ${id} removido`);
    return { message: 'Documento removido com sucesso' };
  }

  /**
   * Envia notificações para os usuários que devem receber o documento
   */
  private async enviarNotificacaoDocumento(
    document: any,
    senderId: string,
    companyId?: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Iniciando envio de notificação: documentId=${document.id}, recipientType=${document.recipientType}, companyId=${companyId || 'null'}`,
      );

      // Obter IDs dos usuários que devem receber a notificação baseado no recipientType
      const recipientUserIds = await this.obterDestinatariosPorTipo(
        document.recipientType,
        companyId,
      );

      if (recipientUserIds.length === 0) {
        this.logger.warn(
          `Nenhum destinatário encontrado para o tipo ${document.recipientType} (companyId: ${companyId || 'null'})`,
        );
        return;
      }

      this.logger.log(
        `Destinatários encontrados: ${recipientUserIds.length} usuário(s)`,
      );

      // Obter nome do remetente
      const senderName = document.sender?.name || 'Usuário';

      // Criar título e mensagem da notificação
      const recipientTypeLabel = this.getRecipientTypeLabel(
        document.recipientType,
      );
      const title = `Novo documento recebido - ${recipientTypeLabel}`;
      const message = `${senderName} enviou um documento: ${document.description || document.file?.originalName || 'Sem descrição'}`;

      // Enviar notificação para cada destinatário
      await this.notificationHelper.notificarUsuarios(
        recipientUserIds,
        title,
        message,
        'document',
        document.id,
        senderId,
        companyId,
      );

      this.logger.log(
        `Notificações enviadas para ${recipientUserIds.length} destinatário(s)`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao enviar notificações de documento: ${error.message}`,
        error.stack,
      );
      // Não lançar erro para não quebrar o fluxo de criação do documento
    }
  }

  /**
   * Obtém os IDs dos usuários que devem receber o documento baseado no recipientType
   * ADMINs sempre recebem documentos enviados para RH e SUPERVISOR também
   */
  private async obterDestinatariosPorTipo(
    recipientType: DocumentRecipientType,
    companyId?: string,
  ): Promise<string[]> {
    let roles: Roles[] = [];

    switch (recipientType) {
      case DocumentRecipientType.HR:
        roles = [Roles.ADMIN, Roles.SYSTEM_ADMIN];
        break;
      case DocumentRecipientType.SUPERVISOR:
        roles = [Roles.C2C, Roles.FIELD_TEAM, Roles.ADMIN, Roles.SYSTEM_ADMIN];
        break;
      case DocumentRecipientType.ADMIN:
        // ADMIN recebe documentos para ADMIN e SYSTEM_ADMIN
        roles = [Roles.ADMIN, Roles.SYSTEM_ADMIN];
        break;
      default:
        this.logger.warn(
          `Tipo de destinatário não reconhecido: ${recipientType}`,
        );
        return [];
    }

    this.logger.log(
      `Buscando destinatários: recipientType=${recipientType}, roles=${roles.join(', ')}, companyId=${companyId}`,
    );

    // Buscar usuários ativos com os roles especificados
    const whereClause: any = {
      role: { in: roles },
      status: 'ACTIVE',
      deletedAt: null,
    };

    // Adicionar companyId apenas se fornecido
    if (companyId) {
      whereClause.companyId = companyId;
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      select: { id: true, name: true, role: true },
    });

    this.logger.log(
      `Encontrados ${users.length} destinatário(s): ${users.map((u) => `${u.name} (${u.role})`).join(', ')}`,
    );

    return users.map((user) => user.id);
  }

  /**
   * Retorna o label do tipo de destinatário para exibição
   */
  private getRecipientTypeLabel(recipientType: DocumentRecipientType): string {
    switch (recipientType) {
      case DocumentRecipientType.HR:
        return 'RH';
      case DocumentRecipientType.SUPERVISOR:
        return 'Supervisor';
      case DocumentRecipientType.ADMIN:
        return 'Administração';
      default:
        return 'Destinatário';
    }
  }
}
