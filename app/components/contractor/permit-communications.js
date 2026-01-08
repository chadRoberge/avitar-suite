import Component from '@glimmer/component';

export default class ContractorPermitCommunicationsComponent extends Component {
  // Only show public comments to contractors
  get publicComments() {
    const comments = this.args.comments || [];
    return comments.filter((comment) => comment.visibility === 'public');
  }

  // Department feedback (comments with a department field)
  get departmentFeedback() {
    return this.publicComments.filter((comment) => comment.department);
  }

  // Regular comments (not from department reviews)
  get regularComments() {
    return this.publicComments.filter((comment) => !comment.department);
  }

  // Check if there's any department feedback requiring action
  get hasDepartmentFeedback() {
    return this.departmentFeedback.length > 0;
  }
}
