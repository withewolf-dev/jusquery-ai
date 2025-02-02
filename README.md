# Express TypeScript Server

A basic Express.js server with TypeScript support and hot-reloading using Nodemon.

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Start development server:
```bash
yarn dev
```

3. Build for production:
```bash
yarn build
```

4. Start production server:
```bash
yarn start
```

## Available Scripts

- `yarn dev`: Starts the development server with hot-reloading
- `yarn build`: Compiles TypeScript to JavaScript
- `yarn start`: Runs the compiled JavaScript
- `yarn watch-ts`: Watches TypeScript files and recompiles on changes

## Project Structure

- `src/`: TypeScript source files
- `dist/`: Compiled JavaScript files
- `package.json`: Project dependencies and scripts
- `tsconfig.json`: TypeScript configuration
- `nodemon.json`: Nodemon configuration 