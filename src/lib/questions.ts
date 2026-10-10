export function normalizeQuestion(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[\s\d一二三四五六七八九十]+[.、．)）:：\s-]*/, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function splitQuestions(input: string): string[] {
  const cleaned = input.replace(/\r\n?/g, "\n").trim();
  if (!cleaned) return [];

  const numbered = cleaned.replace(/([^\n])\s+(?=\d{1,3}[.、．)）]\s*)/g, "$1\n");
  return numbered
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]|\d{1,3}[.、．)）]|[一二三四五六七八九十]+[、．.])\s*/, "")
        .trim(),
    )
    .filter((line) => line.length >= 3);
}

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["Redis", /redis|缓存|布隆过滤器|持久化|rdb|aof|跳表|分布式锁/i],
  ["Spring", /spring|bean|ioc|aop|mybatis|事务传播/i],
  ["数据库", /mysql|sql|数据库|索引|事务|mvcc|innodb|慢查询|隔离级别/i],
  ["计算机网络", /tcp|udp|http|https|dns|网络|三次握手|四次挥手|拥塞控制/i],
  ["Java", /java|jvm|juc|hashmap|垃圾回收|gc|线程池|反射|类加载/i],
  ["操作系统", /进程|线程|死锁|内存|操作系统|虚拟内存|页表|调度/i],
  ["前端", /react|vue|javascript|typescript|浏览器|css|前端|dom/i],
  ["算法", /算法|二叉树|链表|动态规划|时间复杂度|排序|递归/i],
  ["系统设计", /系统设计|架构|高并发|限流|熔断|消息队列|分库分表/i],
];

export function localClassification(question: string, categories: string[]): { category: string; tags: string[] } {
  const known = CATEGORY_RULES.find(([name, rule]) => categories.includes(name) && rule.test(question))?.[0];
  const custom = categories.find((name) => name !== "其他" && question.toLowerCase().includes(name.toLowerCase()));
  const category = known ?? custom ?? "其他";
  return { category, tags: [] };
}
