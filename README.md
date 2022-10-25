# portfolio-website

This project contains the source code for my portfolio website.

See the current build at https://tjvezina.github.io/portfolio-website/

### Development

- `yarn build`
  - Run webpack, compiling all typescript in `./src/` and outputting the results to `./dist/`
- `yarn serve`
  - Build, then serve on `http://localhost:8080/`, hot reloading when files change
- `yarn deploy`
  - Build, then copy the contents of `./dist/` to the `gh-pages` branch and push (this updates the GitHub Pages site)
