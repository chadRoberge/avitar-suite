import Component from '@glimmer/component';

export default class ContractorPermitCommunicationsComponent extends Component {
  // Only show public comments to contractors
  get publicComments() {
    const comments = this.args.comments || [];
    return comments.filter((comment) => comment.visibility === 'public');
  }
}
