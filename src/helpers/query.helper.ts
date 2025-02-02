interface ParsedQuery {
  collectionName: string;
  operation: string;
  params: any;
}

export function parseMongoQuery(queryStr: string): ParsedQuery {
  const collectionMatch = queryStr.match(/db\.(['"]?)([^.'"\s]+)\1\.(aggregate|find|findOne|update|delete)/);
  if (!collectionMatch) {
    throw new Error('Invalid query format');
  }

  const [, , collectionName, operation] = collectionMatch;
  let params: any;

  if (operation === 'aggregate') {
    const pipelineMatch = queryStr.match(/aggregate\(([\s\S]*)\)/);
    if (!pipelineMatch) {
      throw new Error('Invalid aggregate query format');
    }
    params = eval(pipelineMatch[1]); // Pipeline array
  } else if (operation === 'find' || operation === 'findOne') {
    const queryMatch = queryStr.match(/find(?:One)?\((.*)\)/);
    if (!queryMatch) {
      throw new Error('Invalid find query format');
    }
    params = queryMatch[1] ? JSON.parse(queryMatch[1]) : {};
  }

  return { collectionName, operation, params };
} 