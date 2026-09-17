import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { buildPasswordChangedEmailHtml } from '../templates/password-changed-email.template';
import { buildPasswordResetEmailHtml } from '../templates/password-reset-email.template';
import { PASSWORD_RESET_LOGO_URL } from '../constants';

const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
const SMTP_SOCKET_TIMEOUT_MS = 10_000;
const SMTP_WARMUP_TIMEOUT_MS = 4_000;
const LOG_PASSWORD_CHANGED = 'senha-alterada';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private warmupPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    void this.warmupSmtpConnection();
  }

  sendPasswordResetEmail(email: string, name: string, token: string): void {
    const html = buildPasswordResetEmailHtml({
      userName: name,
      token,
      logoUrl: this.getLogoUrl(),
    });

    this.dispatchHtmlEmail(email, 'Recuperação de Senha - DER', html);
  }

  sendPasswordChangedEmail(email: string, name: string): void {
    const html = buildPasswordChangedEmailHtml({
      userName: name,
      logoUrl: this.getLogoUrl(),
    });

    this.logger.log(
      `[${LOG_PASSWORD_CHANGED}] Disparando confirmação de senha alterada para ${email}`,
    );
    this.dispatchHtmlEmail(
      email,
      'Senha alterada - DER',
      html,
      LOG_PASSWORD_CHANGED,
    );
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const html = `<p>Olá, ${name}.</p><p>Bem-vindo ao sistema DER.</p>`;
    await this.sendHtmlEmail(email, 'Bem-vindo - DER', html);
  }

  async sendSuspiciousLoginEmail(
    email: string,
    name: string,
    location: string,
  ): Promise<void> {
    const html = `<p>Olá, ${name}.</p><p>Detectamos um login suspeito em: ${location}.</p>`;
    await this.sendHtmlEmail(email, 'Alerta de segurança - DER', html);
  }

  async sendNotificationEmail(
    email: string,
    name: string,
    subject: string,
    message: string,
  ): Promise<void> {
    const html = `<p>Olá, ${name}.</p><p>${message}</p>`;
    await this.sendHtmlEmail(email, subject, html);
  }

  /** Envia em background para não bloquear a resposta HTTP. */
  private dispatchHtmlEmail(
    to: string,
    subject: string,
    html: string,
    logContext?: string,
  ): void {
    void this.sendHtmlEmail(to, subject, html, logContext).catch(
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.handleSendFailure(to, subject, message, logContext);
      },
    );
  }

  private async sendHtmlEmail(
    to: string,
    subject: string,
    html: string,
    logContext?: string,
  ): Promise<void> {
    await this.ensureSmtpReady();

    const transport = this.getTransporter();

    if (!transport) {
      const prefix = logContext ? `[${logContext}] ` : '';
      this.logger.warn(
        `${prefix}SMTP não configurado; e-mail não enviado para ${to} (assunto: ${subject})`,
      );
      return;
    }

    const from = this.configService.get<string>(
      'SMTP_FROM',
      'DER <suporte@lobocode.com.br>',
    );

    const startedAt = Date.now();
    const result = await transport.sendMail({
      from,
      to,
      subject,
      html,
    });

    const prefix = logContext ? `[${logContext}] ` : '';
    this.logger.log(
      `${prefix}E-mail enviado para ${to} em ${Date.now() - startedAt}ms (messageId: ${result.messageId ?? 'n/a'})`,
    );
  }

  /** Abre conexão SMTP no boot para o 1º envio não pagar handshake completo. */
  private warmupSmtpConnection(): Promise<void> {
    if (!this.warmupPromise) {
      this.warmupPromise = this.runSmtpWarmup();
    }
    return this.warmupPromise;
  }

  private async runSmtpWarmup(): Promise<void> {
    const transport = this.getTransporter();
    if (!transport) {
      return;
    }

    const startedAt = Date.now();
    try {
      await Promise.race([
        transport.verify(),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('SMTP warmup timeout')),
            SMTP_WARMUP_TIMEOUT_MS,
          ),
        ),
      ]);
      this.logger.log(`SMTP pool aquecido em ${Date.now() - startedAt}ms`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `SMTP warmup: ${message} (primeiro envio pode demorar mais)`,
      );
    }
  }

  private async ensureSmtpReady(): Promise<void> {
    if (this.warmupPromise) {
      await this.warmupPromise.catch(() => undefined);
    }
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const portRaw = this.configService.get<string>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !portRaw || !user || !pass) {
      this.logger.warn(
        'SMTP_HOST, SMTP_PORT, SMTP_USER ou SMTP_PASS não configurados; envio desabilitado',
      );
      return null;
    }

    const port = Number(portRaw);
    const secure =
      this.configService.get<string>('SMTP_SECURE', 'false').toLowerCase() ===
      'true';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: port === 587 && !secure,
      auth: { user, pass },
      pool: true,
      maxConnections: 2,
      maxMessages: 200,
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      tls: { minVersion: 'TLSv1.2' },
    });

    this.logger.log(`SMTP: ${host}:${port} (pool=true, user=${user})`);
    return this.transporter;
  }

  private handleSendFailure(
    to: string,
    subject: string,
    message: string,
    logContext?: string,
  ): void {
    const prefix = logContext ? `[${logContext}] ` : '';
    const isAuthError = /535|authentication failed|invalid login/i.test(
      message,
    );
    if (isAuthError) {
      this.transporter = null;
      this.logger.error(
        `${prefix}SMTP autenticação rejeitada. Confira credenciais no hPanel Hostinger.`,
      );
    }
    this.logger.error(
      `${prefix}Falha ao enviar e-mail para ${to} (${subject}): ${message}`,
    );
  }

  private getLogoUrl(): string {
    return (
      this.configService.get<string>('PASSWORD_RESET_LOGO_URL') ??
      PASSWORD_RESET_LOGO_URL
    );
  }
}
