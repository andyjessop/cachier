import { RemoteCache } from 'nx/src/tasks-runner/default-tasks-runner';
import defaultTaskRunner from 'nx/tasks-runners/default';
import { join, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';

export default async function customTaskRunner(tasks, options, ctx) {
  options.remoteCache = new CustomRemoteCache();

  return defaultTaskRunner(tasks, options, ctx);
}

class CustomRemoteCache implements RemoteCache {
  retrieved = false;

  async retrieve(hash: string, cacheDirectory: string): Promise<boolean> {
      const objects = await fetch(`https://worker.andrewdjessop.workers.dev/list?prefix=${hash}`, {
        headers: {
          'x-cachier-api-key': process.env.CACHIER_API_KEY,
        }
      })
        .then(res => res.json())
        .then(res => (res as any).objects);

      const keys = objects.flatMap(object => object.key);
      
      if (!keys.length) {
        console.log('Remote cache miss.');
        return false;
      }

      console.log('Remote cache hit.');

      this.retrieved = true;

      const downloadPromises = keys.map(async (key) => {
        const fileUrl = `https://worker.andrewdjessop.workers.dev/assets/${key}`;
        const filePath = join(cacheDirectory, key);
    
        const fileDirectory = filePath.split('/').slice(0, -1).join('/');
    
        if (!existsSync(fileDirectory)) {
          mkdirSync(fileDirectory, { recursive: true });
        }
    
        const response = await fetch(fileUrl, {
          headers: {
            'x-cachier-api-key': process.env.CACHIER_API_KEY,
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to download ${fileUrl}`);
        }
    
        const buffer = await response.arrayBuffer();

        writeFileSync(filePath, Buffer.from(buffer));
      });
    
      await Promise.all(downloadPromises);

      return true;
  }

  async store(hash: string, cacheDirectory: string): Promise<boolean> {
    if (this.retrieved) {
      console.log('\nSkipping store method as task was retrived from remote cache.');
      return false;
    }

    const directoryPath = join(cacheDirectory, hash);
    const commitFilePath = join(cacheDirectory, `${hash}.commit`);

    try {
      const filenames = [...this.getAllFilenames(directoryPath), commitFilePath];

      for (const file of filenames) {
        const key = relative(cacheDirectory, file);

        await fetch(`https://worker.andrewdjessop.workers.dev/assets/${key}`, {
          headers: {
            'x-cachier-api-key': process.env.CACHIER_API_KEY,
          },
          method: 'POST',
          body: `@${file}`,
        });
      }

      console.log('\nCache pushed to CDN.');

      return true;
    } catch (error) {
      console.error('Error in CustomRemoteCache::store', error);
      return false;
    }
  }

  private getAllFilenames(dir: string): string[] {
    const dirents = readdirSync(dir, { withFileTypes: true });

    const files = dirents.map((dirent) => {
      const res = resolve(dir, dirent.name);
      return dirent.isDirectory() ? this.getAllFilenames(res) : res;
    });

    return [...files].flat();
  }
}