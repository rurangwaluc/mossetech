export function getDeploymentVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_URL ||
    'local-development'
  );
}
