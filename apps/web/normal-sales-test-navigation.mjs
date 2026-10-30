export function redirect(path) {
  throw new Error("TEST_REDIRECT:" + path);
}
