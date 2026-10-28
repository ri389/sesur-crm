import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

function formatInvitationValidity(ttlMinutes: number): string {
  const parts: string[] = [];
  let remainingMinutes = ttlMinutes;
  const days = Math.floor(remainingMinutes / 1_440);
  remainingMinutes %= 1_440;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  if (days > 0) parts.push(days === 1 ? 'un jour' : `${days} jours`);
  if (hours > 0) parts.push(hours === 1 ? 'une heure' : `${hours} heures`);
  if (minutes > 0) parts.push(minutes === 1 ? 'une minute' : `${minutes} minutes`);
  return parts.join(' et ');
}

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  async sendInvitation(
    email: string,
    roleName: string,
    invitationUrl: string,
    ttlMinutes: number,
  ): Promise<void> {
    const mailer = this.config.get<string>('MAIL_MAILER')?.trim().toLowerCase();
    const host = this.config.get<string>('MAIL_HOST')?.trim();
    const port = Number(this.config.get<string>('MAIL_PORT') ?? 587);
    const username = this.config.get<string>('MAIL_USERNAME')?.trim();
    const password = this.config.get<string>('MAIL_PASSWORD');
    const encryption = this.config.get<string>('MAIL_ENCRYPTION')?.trim().toLowerCase();
    const fromAddress = this.config.get<string>('MAIL_FROM_ADDRESS')?.trim();
    const fromName = this.config.get<string>('MAIL_FROM_NAME')?.trim() || 'SESUR CRM';
    const validity = formatInvitationValidity(ttlMinutes);

    if (
      mailer !== 'smtp' ||
      !host ||
      !Number.isInteger(port) ||
      port <= 0 ||
      port > 65535 ||
      !username ||
      !password ||
      !fromAddress ||
      !['tls', 'ssl', 'null', ''].includes(encryption ?? '')
    ) {
      throw new ServiceUnavailableException(
        'Le serveur SMTP n’est pas complètement configuré. Vérifiez MAIL_MAILER, MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD et MAIL_FROM_ADDRESS dans .env.',
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: encryption === 'ssl' || port === 465,
      requireTLS: encryption === 'tls',
      auth: { user: username, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    try {
      await transporter.sendMail({
        from: { name: fromName, address: fromAddress },
        to: email,
        subject: 'Invitation à rejoindre SESUR CRM',
        html: `<p>Vous êtes invité(e) à rejoindre SESUR CRM avec le rôle <strong>${this.escapeHtml(roleName)}</strong>.</p><p><a href="${this.escapeHtml(invitationUrl)}">Créer mon compte</a></p><p>Ce lien expire dans ${validity}.</p>`,
        text: `Vous êtes invité(e) à rejoindre SESUR CRM avec le rôle ${roleName}.\nCe lien expire dans ${validity} : ${invitationUrl}`,
      });
    } catch {
      throw new ServiceUnavailableException(
        'L’e-mail d’invitation n’a pas pu être envoyé. Vérifiez les identifiants et les réglages du serveur SMTP.',
      );
    } finally {
      transporter.close();
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/gu, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character] ?? character;
    });
  }
}
