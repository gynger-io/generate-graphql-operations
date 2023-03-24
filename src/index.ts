#!/usr/bin/env node

import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { JsonFileLoader } from '@graphql-tools/json-file-loader';
import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';
import { buildOperationNodeForField } from '@graphql-tools/utils';
import * as fs from 'fs';
import { GraphQLFieldMap, GraphQLSchema, OperationTypeNode, print } from 'graphql';
import { resolve as pathResolve } from 'path';
import * as yargs from 'yargs';

(async () => {
  // yargs command options config
  const { path, url, file } = await yargs.options({
    path: { type: 'string', alias: 'p', demandOption: true },
    url: { type: 'string' },
    file: { type: 'string' },
  }).check((argv, options) => {
    if (!argv.file && !argv.url) {
      throw new Error('You must pass either an url or a file!');
    } else {
      return true;
    }
  }).argv;

  // load schema
  const schema = await loadSchema(url || file || '', {
    loaders: [
      new UrlLoader(),
      new JsonFileLoader(),
      new GraphQLFileLoader(),
    ],
  });

  // clean dir
  cleanDir(pathResolve(path));

  // get operations fields
  const mutations = schema.getMutationType()?.getFields();
  const queries = schema.getQueryType()?.getFields();
  const subscriptions = schema.getSubscriptionType()?.getFields();

  // generate files
  await Promise.all([
    mutations && generateFilesForFields(schema, mutations, OperationTypeNode.MUTATION, path),
    queries && generateFilesForFields(schema, queries, OperationTypeNode.QUERY, path),
    subscriptions && generateFilesForFields(schema, subscriptions, OperationTypeNode.SUBSCRIPTION, path),
  ]);
})();

async function generateFilesForFields(
  schema: GraphQLSchema,
  obj: GraphQLFieldMap<any, any>,
  kind: OperationTypeNode,
  path: string,
) {
  const opsPath = `${pathResolve(path)}/${kind === 'query' ? 'queries' : kind === 'mutation'
    ? 'mutations' : 'subscriptions'}`;

  // create operations directory if it doesnt exit
  if (!fs.existsSync(opsPath)) {
    fs.mkdirSync(opsPath);
  }

  // loop through each operation and create graphql file
  const files = await Promise.all(Object.keys(obj).map(
    field => new Promise<{ field: string, file: string }>(resolve => {
      const ops = buildOperationNodeForField({
        schema,
        kind,
        field,
        circularReferenceDepth: 5,
      });
      const file = `${opsPath}/${field}.graphql`;
      const content = `${print(ops)}`;
      fs.writeFile(
        file,
        content,
        () => resolve({
          field: field.replace(/\.?([A-Z]+)/g, (x, y) => '_' + y)
            .replace(/^_/, '')
            .toUpperCase(),
          file,
        }),
      );
    })));

  // create import file for operations
  const lines = files.map(({ field, file }) => `export const ${field} = loader('${file.replace(
    opsPath,
    '.',
  )}')`).join(`\r\n`);
  fs.writeFileSync(`${opsPath}/index.ts`, `import { loader } from 'graphql.macro'\r\n${lines}`);
}

function cleanDir(dirPath: string, removeSelf = false) {
  if (fs.existsSync(dirPath)) {
    try { var files = fs.readdirSync(dirPath); } catch (e) { return; }
    if (files.length > 0) {
      for (var i = 0; i < files.length; i++) {
        var filePath = dirPath + '/' + files[i];
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        } else {
          cleanDir(filePath, true);
        }
      }
    }
    removeSelf && fs.rmdirSync(dirPath);
  } else {
    fs.mkdirSync(dirPath);
  }
}
