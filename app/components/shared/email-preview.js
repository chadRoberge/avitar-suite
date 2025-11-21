import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class SharedEmailPreviewComponent extends Component {
  // Args from parent:
  // @template - template object to preview
  // @onClose - close action

  get previewSubject() {
    return this.replaceSampleVariables(this.args.template?.subject || '');
  }

  get previewBody() {
    return this.replaceSampleVariables(this.args.template?.html_body || '');
  }

  replaceSampleVariables(text) {
    // Replace template variables with sample data for preview
    const replacements = {
      municipality_name: 'Town of Springfield',
      municipality_address: '123 Main Street, Springfield, MA 01101',
      current_date: 'January 15, 2025',
      user_name: 'John Doe',
      user_email: 'john.doe@example.com',
      permit_number: 'BP-2025-001',
      permit_type: 'Building Permit - Residential Addition',
      permit_status: 'Under Review',
      property_address: '456 Oak Street, Springfield, MA 01101',
      application_date: 'January 10, 2025',
      contractor_name: 'ABC Construction LLC',
      contractor_phone: '(555) 123-4567',
      inspection_type: 'Final Inspection',
      inspection_date: 'January 20, 2025',
      inspection_time: '10:00 AM',
      inspector_name: 'Jane Smith',
      inspector_phone: '(555) 987-6543',
      license_number: 'LIC-2025-001',
      license_type: 'General Contractor License',
      license_expiration: 'December 31, 2025',
      days_until_expiration: '30',
      renewal_link: 'https://example.com/renew/LIC-2025-001',
    };

    let result = text;
    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  @action
  handleClose() {
    this.args.onClose?.();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
