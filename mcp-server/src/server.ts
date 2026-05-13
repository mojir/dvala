import process from 'node:process'
import { runMcpServer } from '../../packages/dvala-mcp-server/src/index'

runMcpServer().catch(error => {
  // eslint-disable-next-line no-console
  console.error('MCP server error:', error)
  process.exit(1)
})
