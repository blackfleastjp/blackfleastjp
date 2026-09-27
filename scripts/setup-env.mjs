import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setValue(environmentText, key, value) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  if (!line.test(environmentText)) throw new Error(`The environment template is missing ${key}.`);
  return environmentText.replace(line, `${key}=${value}`);
}

function getValue(environmentText, key) {
  const match = environmentText.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) throw new Error(`The environment file is missing ${key}.`);
  return match[1];
}

function addMissingValue(environmentText, key, value) {
  if (new RegExp(`^${key}=`, 'm').test(environmentText)) return environmentText;
  const newline = environmentText.includes('\r\n') ? '\r\n' : '\n';
  return `${environmentText.replace(/(?:\r?\n)*$/, '')}${newline}${key}=${value}${newline}`;
}

async function createFromTemplate(relativeTarget, relativeTemplate, updateTemplate) {
  const targetPath = path.join(repositoryRoot, relativeTarget);
  const templatePath = path.join(repositoryRoot, relativeTemplate);
  await mkdir(path.dirname(targetPath), { recursive: true });

  let template = await readFile(templatePath, 'utf8');
  if (updateTemplate) template = updateTemplate(template);

  try {
    await writeFile(targetPath, template, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.info(`Created ${relativeTarget}.`);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      console.info(`Kept existing ${relativeTarget}; it was not overwritten.`);
      return false;
    }
    throw error;
  }
}

try {
  const apiCreated = await createFromTemplate('apps/api/.env', 'apps/api/.env.example', (text) => {
    const accessSecret = randomBytes(48).toString('base64url');
    const refreshSecret = randomBytes(48).toString('base64url');
    const initialAdminPassword = randomBytes(24).toString('base64url');
    return setValue(
      setValue(
        setValue(text, 'ACCESS_TOKEN_SECRET', accessSecret),
        'REFRESH_TOKEN_SECRET',
        refreshSecret,
      ),
      'SEED_ADMIN_PASSWORD',
      initialAdminPassword,
    );
  });
  const webCreated = await createFromTemplate('apps/web/.env', 'apps/web/.env.example');
  const composeCreated = await createFromTemplate('.env', '.env.docker.example', (text) => {
    const databasePassword = randomBytes(24).toString('base64url');
    const accessSecret = randomBytes(48).toString('base64url');
    const refreshSecret = randomBytes(48).toString('base64url');
    const initialAdminPassword = randomBytes(24).toString('base64url');
    return setValue(
      setValue(
        setValue(
          setValue(
            setValue(
              setValue(text, 'POSTGRES_PASSWORD', databasePassword),
              'DATABASE_URL',
              `postgresql://lifter:${databasePassword}@db:5432/lifter_erp?schema=public`,
            ),
            'DIRECT_URL',
            `postgresql://lifter:${databasePassword}@db:5432/lifter_erp?schema=public`,
          ),
          'ACCESS_TOKEN_SECRET',
          accessSecret,
        ),
        'REFRESH_TOKEN_SECRET',
        refreshSecret,
      ),
      'SEED_ADMIN_PASSWORD',
      initialAdminPassword,
    );
  });

  const composePath = path.join(repositoryRoot, '.env');
  let composeEnvironment = await readFile(composePath, 'utf8');
  const composeWithDirectUrl = addMissingValue(
    composeEnvironment,
    'DIRECT_URL',
    getValue(composeEnvironment, 'DATABASE_URL'),
  );
  if (composeWithDirectUrl !== composeEnvironment) {
    composeEnvironment = composeWithDirectUrl;
    await writeFile(composePath, composeEnvironment, { encoding: 'utf8', mode: 0o600 });
    console.info('Added DIRECT_URL to the existing Compose environment.');
  }
  const databasePassword = encodeURIComponent(getValue(composeEnvironment, 'POSTGRES_PASSWORD'));
  const apiPath = path.join(repositoryRoot, 'apps/api/.env');
  let apiEnvironment = await readFile(apiPath, 'utf8');
  const apiWithDirectUrl = addMissingValue(
    apiEnvironment,
    'DIRECT_URL',
    getValue(apiEnvironment, 'DATABASE_URL'),
  );
  if (apiWithDirectUrl !== apiEnvironment) {
    apiEnvironment = apiWithDirectUrl;
    await writeFile(apiPath, apiEnvironment, { encoding: 'utf8', mode: 0o600 });
    console.info('Added DIRECT_URL to the existing API environment.');
  }
  const currentDatabaseUrl = getValue(apiEnvironment, 'DATABASE_URL');
  const templateDatabaseUrl = 'postgresql://lifter:lifter@localhost:5432/lifter_erp?schema=public';
  if (apiCreated || currentDatabaseUrl === templateDatabaseUrl) {
    const localDatabaseUrl = `postgresql://lifter:${databasePassword}@localhost:5433/lifter_erp?schema=public`;
    await writeFile(
      apiPath,
      setValue(
        setValue(apiEnvironment, 'DATABASE_URL', localDatabaseUrl),
        'DIRECT_URL',
        localDatabaseUrl,
      ),
      { encoding: 'utf8', mode: 0o600 },
    );
    if (!apiCreated)
      console.info('Updated the default local DATABASE_URL to use the generated Compose database.');
  }

  if (apiCreated) {
    const composeEnvironment = await readFile(path.join(repositoryRoot, '.env'), 'utf8');
    const apiPath = path.join(repositoryRoot, 'apps/api/.env');
    const apiEnvironment = await readFile(apiPath, 'utf8');
    const databasePassword = encodeURIComponent(getValue(composeEnvironment, 'POSTGRES_PASSWORD'));
    const localDatabaseUrl = `postgresql://lifter:${databasePassword}@localhost:5433/lifter_erp?schema=public`;
    await writeFile(
      apiPath,
      setValue(
        setValue(apiEnvironment, 'DATABASE_URL', localDatabaseUrl),
        'DIRECT_URL',
        localDatabaseUrl,
      ),
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  if (apiCreated) {
    console.info(
      'Unique JWT secrets and an initial administrator password were generated in apps/api/.env.',
    );
    console.info('DATABASE_URL targets the generated Compose database at localhost:5433.');
  }
  if (webCreated) console.info('The web app is configured to use the local /api proxy.');
  if (composeCreated) {
    console.info(
      'Unique PostgreSQL/JWT/admin credentials were generated in the root .env for Docker Compose.',
    );
    console.info(
      'Use `docker compose up --build -d` to start PostgreSQL, the API, and the web app.',
    );
  }
} catch (error) {
  console.error('Environment setup failed.', error);
  process.exitCode = 1;
}
