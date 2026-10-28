import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Envoi des codes via le modèle OTP AUTHENTICATION de WhatsApp Cloud API. */
@Injectable()
export class WhatsappService {
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): void {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim();
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION')?.trim();
    if (
      !phoneNumberId ||
      !this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim() ||
      !apiVersion ||
      !this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME')?.trim() ||
      !this.config.get<string>('WHATSAPP_OTP_TEMPLATE_LANGUAGE')?.trim() ||
      !/^\d+$/u.test(phoneNumberId) ||
      !/^v\d+\.\d+$/u.test(apiVersion)
    ) {
      throw new ServiceUnavailableException(
        'L’authentification WhatsApp n’est pas configurée. Vérifiez les paramètres WHATSAPP_* du serveur.',
      );
    }
  }

  async sendAuthenticationCode(phone: string, code: string): Promise<void> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim();
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim();
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION')?.trim();
    const templateName = this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME')?.trim();
    const language = this.config.get<string>('WHATSAPP_OTP_TEMPLATE_LANGUAGE')?.trim();

    this.assertConfigured();
    if (!phoneNumberId || !accessToken || !apiVersion || !templateName || !language) {
      throw new ServiceUnavailableException('L’authentification WhatsApp n’est pas configurée.');
    }

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone.replace(/^\+/u, ''),
            type: 'template',
            template: {
              name: templateName,
              language: { code: language },
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: code }],
                },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'WhatsApp ne peut pas être joint pour le moment. Réessayez dans quelques instants.',
      );
    }

    if (!response.ok) {
      // La réponse Meta peut contenir des détails de compte ; ne pas la renvoyer au navigateur.
      throw new ServiceUnavailableException(
        'WhatsApp n’a pas accepté l’envoi du code. Vérifiez le modèle OTP et la configuration Meta.',
      );
    }
  }
}
