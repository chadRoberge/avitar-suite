import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class BuildingPermitsPermitTypeModalComponent extends Component {
  @tracked currentSection = 1;

  // Make each property tracked individually for reactivity
  @tracked name = '';
  @tracked description = '';
  @tracked categories = []; // Changed from single category to array
  @tracked icon = 'file-alt';
  @tracked subtypes = [];
  @tracked isActive = true;
  @tracked baseAmount = 0;
  @tracked calculationType = 'flat';
  @tracked perSqftRate = 0.50; // Default rate per square foot
  @tracked formula = '';
  @tracked linkedScheduleId = null;
  @tracked departmentReviews = [];
  @tracked requiredDocuments = [];
  @tracked suggestedDocuments = [];
  @tracked templateFiles = [];
  @tracked customFormFields = [];

  categoryOptions = [
    { value: 'building', label: 'Building / Construction' },
    { value: 'electrical', label: 'Electrical' },
    { value: 'plumbing', label: 'Plumbing' },
    { value: 'mechanical', label: 'Mechanical / HVAC' },
    { value: 'renovation', label: 'Renovation / Alteration' },
    { value: 'demolition', label: 'Demolition' },
    { value: 'landscape', label: 'Landscape / Site Work' },
    { value: 'replacement', label: 'Replacement / Repair' },
    { value: 'zoning', label: 'Zoning / Variance' },
    { value: 'sign', label: 'Sign Permit' },
    { value: 'occupancy', label: 'Certificate of Occupancy' },
    { value: 'fire', label: 'Fire / Life Safety' },
    { value: 'roofing', label: 'Roofing' },
    { value: 'fence', label: 'Fence / Wall' },
    { value: 'pool', label: 'Pool / Spa' },
    { value: 'deck', label: 'Deck / Patio' },
    { value: 'foundation', label: 'Foundation' },
    { value: 'other', label: 'Other' },
  ];

  categoryDescriptions = {
    building: 'For new construction, additions, and major structural work',
    electrical: 'For electrical installations, upgrades, and repairs',
    plumbing: 'For plumbing systems, fixtures, and water/sewer connections',
    mechanical: 'For HVAC systems, ventilation, and mechanical equipment',
    renovation: 'For interior/exterior renovations and alterations',
    demolition: 'For demolition or removal of structures',
    landscape: 'For landscaping, grading, and site improvements',
    replacement: 'For replacing existing systems or components',
    zoning: 'For zoning variances, conditional uses, and special exceptions',
    sign: 'For installation or modification of signs',
    occupancy: 'For certificates of occupancy and inspections',
    fire: 'For fire protection systems and life safety equipment',
    roofing: 'For roof repairs, replacement, and installation',
    fence: 'For fence or retaining wall construction',
    pool: 'For swimming pools, hot tubs, and spas',
    deck: 'For decks, patios, and outdoor structures',
    foundation: 'For foundation work and structural repairs',
    other: 'For permit types that don\'t fit other categories',
  };

  get formData() {
    return {
      name: this.name,
      description: this.description,
      categories: this.categories,
      isProject: this.isProject,
      icon: this.icon,
      subtypes: this.subtypes,
      isActive: this.isActive,
      feeSchedule: {
        baseAmount: parseFloat(this.baseAmount) || 0,
        calculationType: this.calculationType,
        perSqftRate: parseFloat(this.perSqftRate) || 0,
        formula: this.formula,
        linkedScheduleId: this.linkedScheduleId,
      },
      departmentReviews: this.departmentReviews,
      customFormFields: this.customFormFields,
      requiredDocuments: this.requiredDocuments,
      suggestedDocuments: this.suggestedDocuments,
      templateFiles: this.templateFiles,
    };
  }

  get isProject() {
    return this.categories.length > 1;
  }

  // For adding new items
  @tracked newSubtype = '';
  @tracked newDepartment = {
    departmentName: '',
    isRequired: true,
    reviewOrder: 1,
    requiredDocuments: [],
  };
  @tracked newRequiredDocument = {
    name: '',
    description: '',
    fileTypes: [],
    maxSizeBytes: 5242880, // 5MB default
    exampleFileUrl: '',
  };
  @tracked newSuggestedDocument = {
    name: '',
    description: '',
    fileTypes: [],
    maxSizeBytes: 5242880,
    exampleFileUrl: '',
  };
  @tracked newFormField = {
    id: '',
    label: '',
    type: 'text',
    placeholder: '',
    required: false,
    options: [],
    helpText: '',
    order: 0,
  };
  @tracked newFieldOption = '';

  constructor(owner, args) {
    super(owner, args);
    this.loadFormData();
  }

  loadFormData() {
    if (this.args.isEditMode && this.args.permitType) {
      const pt = this.args.permitType;
      this.name = pt.name || '';
      this.description = pt.description || '';
      this.categories = [...(pt.categories || [])];
      this.icon = pt.icon || 'file-alt';
      this.subtypes = [...(pt.subtypes || [])];
      this.isActive = pt.isActive !== undefined ? pt.isActive : true;
      this.baseAmount = pt.feeSchedule?.baseAmount || 0;
      this.calculationType = pt.feeSchedule?.calculationType || 'flat';
      this.perSqftRate = pt.feeSchedule?.perSqftRate || 0.50;
      this.formula = pt.feeSchedule?.formula || '';
      this.linkedScheduleId = pt.feeSchedule?.linkedScheduleId || null;
      this.departmentReviews = [...(pt.departmentReviews || [])];
      this.customFormFields = [...(pt.customFormFields || [])];
      this.requiredDocuments = [...(pt.requiredDocuments || [])];
      this.suggestedDocuments = [...(pt.suggestedDocuments || [])];
      this.templateFiles = [...(pt.templateFiles || [])];
    }
  }

  get modalTitle() {
    return this.args.isEditMode ? 'Edit Permit Type' : 'Create Permit Type';
  }

  get sectionTitle() {
    const titles = {
      1: 'Basic Information',
      2: 'Fee Schedule',
      3: 'Application Form Fields',
      4: 'Document Requirements',
      5: 'Review Requirements',
      6: 'Template Files & Resources',
    };
    return titles[this.currentSection] || '';
  }

  get canGoBack() {
    return this.currentSection > 1;
  }

  get canGoNext() {
    return this.currentSection < 6;
  }

  get isLastSection() {
    return this.currentSection === 6;
  }

  get calculationTypes() {
    return [
      { value: 'flat', label: 'Flat Fee' },
      { value: 'per_sqft', label: 'Per Square Foot' },
      { value: 'percentage', label: 'Percentage of Value' },
      { value: 'custom', label: 'Custom Formula' },
    ];
  }

  getCategoryDescription(category) {
    return this.categoryDescriptions[category] || '';
  }

  get iconOptions() {
    return [
      'file-alt',
      'home',
      'hammer',
      'wrench',
      'tools',
      'building',
      'bolt',
      'fire',
      'water',
      'snowflake',
      'tree',
      'road',
      'fence',
      'sign',
    ];
  }

  get departmentOptions() {
    return [
      'Building Inspector',
      'Fire Marshal',
      'Health Department',
      'Planning & Zoning',
      'Engineering',
      'Conservation',
      'Public Works',
      'Code Enforcement',
    ];
  }

  // Fee calculation examples
  get feeExamples() {
    const base = parseFloat(this.baseAmount) || 0;
    const examples = [];

    switch (this.calculationType) {
      case 'flat':
        examples.push(
          { description: 'Any size home', sqft: 'N/A', fee: base.toFixed(2) }
        );
        break;
      case 'per_sqft':
        const rate = parseFloat(this.perSqftRate) || 0;
        [1500, 2500, 3500].forEach(sqft => {
          const fee = base + (sqft * rate);
          examples.push({ description: `${sqft} sq ft home`, sqft, fee: fee.toFixed(2) });
        });
        break;
      case 'percentage':
        [150000, 300000, 500000].forEach(value => {
          const fee = value * (base / 100);
          examples.push({ description: `$${value.toLocaleString()} value`, sqft: 'N/A', fee: fee.toFixed(2) });
        });
        break;
      case 'custom':
        examples.push(
          { description: 'Based on formula', sqft: 'Varies', fee: 'Calculated' }
        );
        break;
    }

    return examples;
  }

  @action
  goToSection(sectionNum) {
    this.currentSection = sectionNum;
  }

  @action
  nextSection() {
    if (this.canGoNext) {
      this.currentSection++;
    }
  }

  @action
  previousSection() {
    if (this.canGoBack) {
      this.currentSection--;
    }
  }

  @action
  updateField(field, event) {
    this[field] = event.target.value;
  }

  @action
  updateFeeField(field, event) {
    this[field] = event.target.value;
  }

  @action
  updateCheckbox(field, event) {
    this[field] = event.target.checked;
  }

  // Subtype management
  @action
  addSubtype(event) {
    event.preventDefault();
    if (this.newSubtype.trim()) {
      this.subtypes = [...this.subtypes, this.newSubtype.trim()];
      this.newSubtype = '';
    }
  }

  @action
  removeSubtype(index) {
    this.subtypes = this.subtypes.filter((_, i) => i !== index);
  }

  @action
  updateNewSubtype(event) {
    this.newSubtype = event.target.value;
  }

  // Department management
  @action
  addDepartment(event) {
    event.preventDefault();
    if (this.newDepartment.departmentName) {
      this.departmentReviews = [
        ...this.departmentReviews,
        { ...this.newDepartment },
      ];
      this.newDepartment = {
        departmentName: '',
        isRequired: true,
        reviewOrder: this.departmentReviews.length + 1,
        requiredDocuments: [],
      };
    }
  }

  @action
  removeDepartment(index) {
    this.departmentReviews = this.departmentReviews.filter((_, i) => i !== index);
    // Reorder remaining departments
    this.reorderDepartments();
  }

  @action
  moveDepartmentUp(index) {
    if (index > 0) {
      const departments = [...this.departmentReviews];
      [departments[index - 1], departments[index]] = [departments[index], departments[index - 1]];
      this.departmentReviews = departments;
      this.reorderDepartments();
    }
  }

  @action
  moveDepartmentDown(index) {
    if (index < this.departmentReviews.length - 1) {
      const departments = [...this.departmentReviews];
      [departments[index], departments[index + 1]] = [departments[index + 1], departments[index]];
      this.departmentReviews = departments;
      this.reorderDepartments();
    }
  }

  @action
  toggleDepartmentDocument(deptIndex, docName, event) {
    const departments = [...this.departmentReviews];
    const dept = { ...departments[deptIndex] };
    const requiredDocs = dept.requiredDocuments || [];

    if (event.target.checked) {
      // Add document
      dept.requiredDocuments = [...requiredDocs, docName];
    } else {
      // Remove document
      dept.requiredDocuments = requiredDocs.filter(d => d !== docName);
    }

    departments[deptIndex] = dept;
    this.departmentReviews = departments;
  }

  reorderDepartments() {
    // Update reviewOrder to match current array position
    this.departmentReviews = this.departmentReviews.map((dept, index) => ({
      ...dept,
      reviewOrder: index + 1,
    }));
  }

  @action
  updateNewDepartment(field, event) {
    if (field === 'isRequired') {
      this.newDepartment[field] = event.target.checked;
    } else {
      this.newDepartment[field] = event.target.value;
    }
  }

  // Required document management
  @action
  addRequiredDocument(event) {
    event.preventDefault();
    if (this.newRequiredDocument.name) {
      this.requiredDocuments = [
        ...this.requiredDocuments,
        { ...this.newRequiredDocument },
      ];
      this.newRequiredDocument = {
        name: '',
        description: '',
        fileTypes: [],
        maxSizeBytes: 5242880,
        exampleFileUrl: '',
      };
    }
  }

  @action
  removeRequiredDocument(index) {
    this.requiredDocuments = this.requiredDocuments.filter((_, i) => i !== index);
  }

  @action
  updateNewRequiredDocument(field, event) {
    this.newRequiredDocument[field] = event.target.value;
  }

  // Suggested document management
  @action
  addSuggestedDocument(event) {
    event.preventDefault();
    if (this.newSuggestedDocument.name) {
      this.suggestedDocuments = [
        ...this.suggestedDocuments,
        { ...this.newSuggestedDocument },
      ];
      this.newSuggestedDocument = {
        name: '',
        description: '',
        fileTypes: [],
        maxSizeBytes: 5242880,
        exampleFileUrl: '',
      };
    }
  }

  @action
  removeSuggestedDocument(index) {
    this.suggestedDocuments = this.suggestedDocuments.filter((_, i) => i !== index);
  }

  @action
  updateNewSuggestedDocument(field, event) {
    this.newSuggestedDocument[field] = event.target.value;
  }

  // Custom form field management
  @action
  addFormField(event) {
    event.preventDefault();
    if (this.newFormField.label) {
      // Generate ID from label if not provided
      if (!this.newFormField.id) {
        this.newFormField.id = this.newFormField.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      }

      this.customFormFields = [
        ...this.customFormFields,
        { ...this.newFormField },
      ];

      this.newFormField = {
        id: '',
        label: '',
        type: 'text',
        placeholder: '',
        required: false,
        options: [],
        helpText: '',
        order: this.customFormFields.length,
      };
    }
  }

  @action
  removeFormField(index) {
    this.customFormFields = this.customFormFields.filter((_, i) => i !== index);
    // Reorder remaining fields
    this.customFormFields = this.customFormFields.map((field, idx) => ({
      ...field,
      order: idx,
    }));
  }

  @action
  updateNewFormField(field, event) {
    if (field === 'required') {
      this.newFormField[field] = event.target.checked;
    } else {
      this.newFormField[field] = event.target.value;
    }
  }

  @action
  addFieldOption(event) {
    event.preventDefault();
    if (this.newFieldOption.trim()) {
      this.newFormField.options = [...this.newFormField.options, this.newFieldOption.trim()];
      this.newFieldOption = '';
    }
  }

  @action
  removeFieldOption(index) {
    this.newFormField.options = this.newFormField.options.filter((_, i) => i !== index);
  }

  @action
  updateFieldOption(event) {
    this.newFieldOption = event.target.value;
  }

  @action
  moveFieldUp(index) {
    if (index > 0) {
      const newFields = [...this.customFormFields];
      [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
      // Update order values
      this.customFormFields = newFields.map((field, idx) => ({
        ...field,
        order: idx,
      }));
    }
  }

  @action
  moveFieldDown(index) {
    if (index < this.customFormFields.length - 1) {
      const newFields = [...this.customFormFields];
      [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
      // Update order values
      this.customFormFields = newFields.map((field, idx) => ({
        ...field,
        order: idx,
      }));
    }
  }

  @action
  toggleCategory(categoryValue) {
    if (this.categories.includes(categoryValue)) {
      // Remove category
      this.categories = this.categories.filter(c => c !== categoryValue);
    } else {
      // Add category
      this.categories = [...this.categories, categoryValue];
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  close() {
    this.args.onClose();
  }

  @action
  async save() {
    // Validate required fields
    if (!this.name || !this.description) {
      alert('Please fill in name and description');
      this.currentSection = 1;
      return;
    }

    if (this.categories.length === 0) {
      alert('Please select at least one category');
      this.currentSection = 1;
      return;
    }

    // Call parent save action
    await this.args.onSave(this.formData);
  }
}
