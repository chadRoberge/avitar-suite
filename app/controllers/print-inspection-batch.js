import Controller from '@ember/controller';
import { action } from '@ember/object';

export default class PrintInspectionBatchController extends Controller {
  @action
  print() {
    window.print();
  }

  @action
  close() {
    window.close();
  }
}
