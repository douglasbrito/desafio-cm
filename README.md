# API Restful Serverless

Stack: AWS Lambda (Node.js) + API Gateway + AWS S3 (armazenamento de imagens) + DynamoDB.

## DynamoDB

Criadas as tabelas "marcas", "categorias" e "produtos" no DynamoDB.
  - Cada tabela possui uma primary Key "id" do tipo String;
  - Para as tabelas "marcas" e "categorias" foi adicionado índice para o campo "nome";
  - Para a tabela "produtos" foi adicionado índice composto para os campos "descricao" e "idMarca";

## AWS Lambda (Node.js)

Criada função Lambda "desafio-cm".
	- Durante a criação da função foi alterada as definições de permissões padrão.
	- Criada uma nova regra de permissões "desafio-cm-role" e anexadas as políticas:
    - AmazonS3FullAccess
    - AmazonDynamoDBFullAccess
		- CloudWatchLogsFullAccess
	- Criada variável de ambiente "S3_BUCKET_NAME" com o nome do bucket S3 "desafio-cm-bucket-dev"
  
## API Gateway

Criada API Rest "desafio-cm" integrando com a Lambda Function desenvolvida.

![API Gateway](https://user-images.githubusercontent.com/2911880/128286051-6b2e4f44-1269-4fc7-b59c-b1a208329047.PNG)
