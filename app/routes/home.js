import Route from '@ember/routing/route';

export default class HomeRoute extends Route {
  model() {
    return [
      {
        title: 'Professional Projects',
        projects: [
          {
            title: 'Bendy in Nightmare Run',
            path: 'binr',
          },
          {
            title: 'Bendy and the Ink Machine (mobile)',
            path: 'bendy',
          },
          {
            title: "Rubik's® Uncubed",
            path: 'rubiks-uncubed',
          },
          {
            title: "Rubik's® Cube",
            path: 'rubiks-cube',
          },
          {
            title: 'Puzzlescape',
            path: 'puzzlescape',
          },
          {
            title: 'Office Attacks!',
            path: 'office-attacks',
          },
          {
            title: 'PieFace: Mobile Edition',
            path: 'pieface',
          },
        ],
      },
      {
        title: 'Personal Projects',
        projects: [
          {
            title: 'p5.js',
            path: 'p5js',
          },
        ],
      },
      {
        title: 'College Projects',
        projects: [
          {
            title: 'Antivirus',
            path: 'antivirus',
          },
          {
            title: 'Optical Intrusion',
            path: 'optical-intrusion',
          },
          {
            title: 'Coils & Nodes',
            path: 'coils-and-nodes',
          },
          {
            title: 'Bumper Ball',
            path: 'bumper-ball',
          },
          {
            title: 'Retro Future',
            path: 'retro-future',
          },
          {
            title: 'Mecharachnid',
            path: 'mecharachnid',
          },
          {
            title: 'Hedge Maze Generator',
            path: 'hedge-maze',
          },
          {
            title: 'CASINO VAL-U-PAK',
            path: 'casino',
          },
        ],
      },
    ];
  }
}
