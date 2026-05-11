declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
  export = classes;
}

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}