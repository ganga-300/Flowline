const prisma = require('./src/prismaClient');

async function main() {
  const executions = await prisma.stepExecution.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(executions, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
