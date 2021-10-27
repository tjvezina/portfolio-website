import Component from '@glimmer/component';
import { action } from '@ember/object';
import SceneManager from '../3d/src/scene-manager';

export default class ThreejsCanvasComponent extends Component {
  sceneManager?: SceneManager;

  @action initialize() {
    const canvas = document.querySelector('#c') as HTMLCanvasElement;

    this.sceneManager = new SceneManager(canvas);
  }
}
