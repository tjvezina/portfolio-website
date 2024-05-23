# portfolio-website

This project contains the source code for my portfolio website.

See the current build at https://tylerjvezina.com/

### Development

- `yarn build`
  - Run webpack, compiling all typescript in `./src/` and outputting the results to `./dist/`
- `yarn serve`
  - Build, then serve on `http://localhost:8080/`, hot reloading when files change

### Deploying Builds

- Every time a commit is pushed to `main`, it is automatically deployed by GitHub Actions
