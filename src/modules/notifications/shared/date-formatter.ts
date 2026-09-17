/**
 * 📅 FORMATADOR DE DATA CENTRALIZADO
 *
 * Utilitário para formatação de datas em notificações.
 * Formato brasileiro: "04:13 do dia 06/10/2025"
 * Timezone: America/Sao_Paulo (GMT-3)
 */

export class DateFormatter {
  private static readonly TIMEZONE = 'America/Sao_Paulo';

  /**
   * 🌎 Converte data para timezone brasileiro
   */
  private static toBrazilianTime(date: Date): Date {
    const brazilianDateString = date.toLocaleString('pt-BR', {
      timeZone: this.TIMEZONE,
    });

    // Parseia a string brasileira de volta para Date
    const [datePart, timePart] = brazilianDateString.split(', ');
    const [day, month, year] = datePart.split('/');
    const [hours, minutes, seconds] = timePart.split(':');

    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds || '0'),
    );
  }

  /**
   * 📅 Formata data e hora no formato brasileiro
   * Exemplo: "04:13 do dia 06/10/2025"
   */
  static formatDateTime(date: Date): string {
    const brazilDate = this.toBrazilianTime(date);

    const hours = brazilDate.getHours().toString().padStart(2, '0');
    const minutes = brazilDate.getMinutes().toString().padStart(2, '0');
    const day = brazilDate.getDate().toString().padStart(2, '0');
    const month = (brazilDate.getMonth() + 1).toString().padStart(2, '0');
    const year = brazilDate.getFullYear();

    return `${hours}:${minutes} do dia ${day}/${month}/${year}`;
  }

  /**
   * 📅 Formata apenas a data
   * Exemplo: "06/10/2025"
   */
  static formatDate(date: Date): string {
    const brazilDate = this.toBrazilianTime(date);

    const day = brazilDate.getDate().toString().padStart(2, '0');
    const month = (brazilDate.getMonth() + 1).toString().padStart(2, '0');
    const year = brazilDate.getFullYear();

    return `${day}/${month}/${year}`;
  }

  /**
   * 🕐 Formata apenas a hora
   * Exemplo: "04:13"
   */
  static formatTime(date: Date): string {
    const brazilDate = this.toBrazilianTime(date);

    const hours = brazilDate.getHours().toString().padStart(2, '0');
    const minutes = brazilDate.getMinutes().toString().padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  /**
   * 📅 Formata data relativa (há quanto tempo)
   * Exemplo: "há 2 horas", "há 1 dia"
   */
  static formatRelative(date: Date): string {
    const now = new Date();
    const brazilNow = this.toBrazilianTime(now);
    const brazilDate = this.toBrazilianTime(date);

    const diffMs = brazilNow.getTime() - brazilDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'agora';
    if (diffMinutes < 60) return `há ${diffMinutes} min`;
    if (diffHours < 24) return `há ${diffHours}h`;
    if (diffDays < 7) return `há ${diffDays}d`;

    return this.formatDate(date);
  }
}
