import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class SharedTemplateVariablesComponent extends Component {
  // Args from parent:
  // @onInsert - function to call when variable is clicked
  // @template - template object (to determine available variables)

  get availableVariables() {
    // Base variables available for all templates
    const baseVars = [
      {
        name: 'municipality_name',
        label: 'Municipality Name',
        example: 'Town of Springfield',
      },
      {
        name: 'municipality_address',
        label: 'Municipality Address',
        example: '123 Main Street',
      },
      { name: 'current_date', label: 'Current Date', example: 'January 15, 2025' },
      { name: 'user_name', label: 'User Name', example: 'John Doe' },
      { name: 'user_email', label: 'User Email', example: 'john@example.com' },
    ];

    // Category-specific variables
    const categoryVars = {
      permits: [
        {
          name: 'permit_number',
          label: 'Permit Number',
          example: 'BP-2025-001',
        },
        {
          name: 'permit_type',
          label: 'Permit Type',
          example: 'Building Permit',
        },
        {
          name: 'permit_status',
          label: 'Permit Status',
          example: 'Under Review',
        },
        {
          name: 'property_address',
          label: 'Property Address',
          example: '456 Oak Street',
        },
        {
          name: 'application_date',
          label: 'Application Date',
          example: 'January 10, 2025',
        },
        {
          name: 'contractor_name',
          label: 'Contractor Name',
          example: 'ABC Construction',
        },
        {
          name: 'contractor_phone',
          label: 'Contractor Phone',
          example: '(555) 123-4567',
        },
      ],
      inspections: [
        {
          name: 'inspection_type',
          label: 'Inspection Type',
          example: 'Final Inspection',
        },
        {
          name: 'inspection_date',
          label: 'Inspection Date',
          example: 'January 20, 2025',
        },
        {
          name: 'inspection_time',
          label: 'Inspection Time',
          example: '10:00 AM',
        },
        {
          name: 'inspector_name',
          label: 'Inspector Name',
          example: 'Jane Smith',
        },
        {
          name: 'inspector_phone',
          label: 'Inspector Phone',
          example: '(555) 987-6543',
        },
        {
          name: 'property_address',
          label: 'Property Address',
          example: '456 Oak Street',
        },
      ],
      licenses: [
        {
          name: 'license_number',
          label: 'License Number',
          example: 'LIC-2025-001',
        },
        {
          name: 'license_type',
          label: 'License Type',
          example: 'Business License',
        },
        {
          name: 'license_expiration',
          label: 'Expiration Date',
          example: 'December 31, 2025',
        },
        {
          name: 'days_until_expiration',
          label: 'Days Until Expiration',
          example: '30',
        },
        {
          name: 'renewal_link',
          label: 'Renewal Link',
          example: 'https://example.com/renew',
        },
      ],
    };

    // Get category-specific variables
    const category = this.args.template?.category || 'general';
    const specificVars = categoryVars[category] || [];

    return [...baseVars, ...specificVars];
  }

  @action
  insertVariable(variable) {
    this.args.onInsert?.(variable.name);
  }
}
