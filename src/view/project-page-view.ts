import { BufferGeometry, Material, Mesh, Object3D, PlaneGeometry } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { ProjectData } from '@/data/types';
import Text, { TextAlignX } from '@/objects/text';
import Wireframe, { WireframeType } from '@/objects/wireframe';

export default class ProjectPageView extends Object3D {
  project: ProjectData;

  constructor(project: ProjectData, color: NeonColor) {
    super();
    this.project = project;

    let yOffset = 2;

    // Title
    const title = new Text(project.title.toUpperCase(), App.synthaFont, {
      color,
      size: 0.3 * App.pixelRatio,
      alignX: TextAlignX.Left,
    });
    title.position.set(-3, yOffset, 0);
    this.add(title);
    yOffset -= 1;

    // Description
    if (project.description) {
      const desc = new Text(project.description, App.synthaFont, {
        color: NeonColor.White,
        size: 0.12 * App.pixelRatio,
        alignX: TextAlignX.Left,
      });
      desc.position.set(-3, yOffset, 0);
      this.add(desc);
      yOffset -= 0.8;
    }

    // Tags
    if (project.tags && project.tags.length > 0) {
      const tagText = new Text(project.tags.join(' \u00B7 '), App.synthaFont, {
        color,
        size: 0.1 * App.pixelRatio,
        alignX: TextAlignX.Left,
      });
      tagText.position.set(-3, yOffset, 0);
      this.add(tagText);
      yOffset -= 0.6;
    }

    // Year
    if (project.year) {
      const yearText = new Text(project.year, App.synthaFont, {
        color: NeonColor.White,
        size: 0.1 * App.pixelRatio,
        alignX: TextAlignX.Left,
      });
      yearText.position.set(-3, yOffset, 0);
      this.add(yearText);
      yOffset -= 0.8;
    }

    // Action buttons
    if (project.playUrls) {
      for (const link of project.playUrls) {
        const btn = this.createButton(link.name.toUpperCase(), color);
        btn.position.set(-3, yOffset, 0);
        btn.userData.url = link.url;
        this.add(btn);
        yOffset -= 0.8;
      }
    }

  }

  private createButton(label: string, color: NeonColor): Object3D {
    const btn = new Object3D();
    const bg = new Wireframe(new PlaneGeometry(2, 0.5), { color, type: WireframeType.Hollow });
    const text = new Text(label, App.synthaFont, { color, size: 0.12 * App.pixelRatio });
    btn.add(bg, text);
    return btn;
  }

  dispose(): void {
    this.traverse((obj) => {
      if (obj instanceof Mesh) {
        (obj.geometry as BufferGeometry).dispose();
        const mat = obj.material as Material | Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }
}
