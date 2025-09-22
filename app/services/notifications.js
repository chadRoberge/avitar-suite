import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class NotificationsService extends Service {
  @tracked messages = [];

  success(message) {
    this.addMessage('success', message);
  }

  error(message) {
    this.addMessage('error', message);
  }

  warning(message) {
    this.addMessage('warning', message);
  }

  info(message) {
    this.addMessage('info', message);
  }

  addMessage(type, message) {
    const notification = {
      id: Date.now() + Math.random(),
      type,
      message,
      timestamp: new Date(),
    };

    this.messages = [...this.messages, notification];

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.removeMessage(notification.id);
    }, 5000);
  }

  removeMessage(id) {
    this.messages = this.messages.filter((msg) => msg.id !== id);
  }

  clear() {
    this.messages = [];
  }
}
