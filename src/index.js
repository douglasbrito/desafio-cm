const AWS = require('aws-sdk');
const DocumentMarca = require('./document-marca');
const DocumentCategoria = require('./document-categoria');
const DocumentProduto = require('./document-produto');

AWS.config.update( {
  region: process.env.AWS_REGION
});
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const Path = {
  MARCA: '/marca',
  CATEGORIA: '/categoria',
  PRODUTO: '/produto'
};

exports.handler = async function(event) {
  console.log('Request event: ', event);
  let document;
  const params = {
    db: dynamodb,
    s3: s3,
    bucketName: BUCKET_NAME
  };

  if (event.path == Path.MARCA) {
    document = new DocumentMarca(params);
  } else if (event.path == Path.CATEGORIA) {
    document = new DocumentCategoria(params);
  } else {
    document = new DocumentProduto(params);
  }

  let response;
  switch(event.httpMethod) {
    case 'GET':
      if (event.queryStringParameters && event.queryStringParameters.id) {
        const docFound = await document.findById(event.queryStringParameters.id);
        response = document.buildResponse(200, docFound);
      } else {
        response = await document.getDocuments();
      }
      break;
    case 'POST':
      response = await document.create(JSON.parse(event.body));
      break;
    case 'PATCH':
      response = await document.update(JSON.parse(event.body));
      break;
    case 'DELETE':
      response = await document.delete(JSON.parse(event.body).id);
      break;
    default:
      response = document.buildResponse(404, '404 Not Found');
  }
  return response;
};
