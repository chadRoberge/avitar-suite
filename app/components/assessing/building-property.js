import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class BuildingPropertyComponent extends Component {
  @tracked currentPhotoIndex = 1;

  get currentPhoto() {
    if (!this.args.photos || this.args.photos.length === 0) return null;
    return this.args.photos[this.currentPhotoIndex - 1];
  }

  get hasPreviousPhoto() {
    return this.currentPhotoIndex > 1;
  }

  get hasNextPhoto() {
    return this.args.photos && this.currentPhotoIndex < this.args.photos.length;
  }

  @action
  previousPhoto() {
    if (this.hasPreviousPhoto) {
      this.currentPhotoIndex -= 1;
    }
  }

  @action
  nextPhoto() {
    if (this.hasNextPhoto) {
      this.currentPhotoIndex += 1;
    }
  }

  @action
  refreshProperty() {
    if (this.args.onRefresh) {
      this.args.onRefresh();
    }
  }
}
