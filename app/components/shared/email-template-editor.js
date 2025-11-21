import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import Quill from 'quill';

export default class SharedEmailTemplateEditorComponent extends Component {
  @tracked editor = null;
  @tracked subject = '';
  @tracked htmlContent = '';

  // Args from parent:
  // @template - template object to edit
  // @onSave - save action
  // @onCancel - cancel action
  // @isLoading - loading state

  constructor() {
    super(...arguments);

    // Initialize form data from template
    if (this.args.template) {
      this.subject = this.args.template.subject || '';
      this.htmlContent = this.args.template.html_body || '';
    }
  }

  @action
  initializeEditor(element) {
    // Initialize Quill editor
    this.editor = new Quill(element, {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['link'],
          ['clean'],
        ],
      },
      placeholder: 'Write your email template content here...',
    });

    // Set initial content
    if (this.htmlContent) {
      this.editor.root.innerHTML = this.htmlContent;
    }

    // Listen for content changes
    this.editor.on('text-change', () => {
      this.htmlContent = this.editor.root.innerHTML;
    });
  }

  @action
  willDestroy() {
    super.willDestroy();
    if (this.editor) {
      this.editor = null;
    }
  }

  @action
  updateSubject(event) {
    this.subject = event.target.value;
  }

  @action
  insertVariable(variableName) {
    if (!this.editor) return;

    // Insert variable at current cursor position
    const selection = this.editor.getSelection();
    if (selection) {
      this.editor.insertText(selection.index, `{{${variableName}}}`);
      this.editor.setSelection(selection.index + variableName.length + 4);
    } else {
      // If no selection, insert at end
      const length = this.editor.getLength();
      this.editor.insertText(length, `{{${variableName}}}`);
    }

    // Update content
    this.htmlContent = this.editor.root.innerHTML;
  }

  @action
  handleSave() {
    const templateData = {
      subject: this.subject,
      html_body: this.htmlContent,
    };

    this.args.onSave?.(templateData);
  }

  @action
  handleCancel() {
    this.args.onCancel?.();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
