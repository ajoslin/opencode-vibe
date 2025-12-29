# ADR-003: OpenCode Vibe as Agent Swarm Control Plane

**Status:** Accepted  
**Date:** 2025-12-29  
**Deciders:** Joel Hooks, Architecture Team  
**Affected Components:** Control plane (`apps/web/`), Agent orchestration, Multi-user infrastructure, Cloud deployment (Pulumi + AWS)

---

## Context

OpenCode currently operates as a **single-user, single-machine development assistant**. The Next.js 16 rebuild (ADR-001) establishes the foundation for transforming this architecture into a **multi-user agent swarm control plane** that coordinates distributed AI agents across Kubernetes clusters.

### Why Pulumi?

Pulumi provides the **TypeScript-native infrastructure-as-code foundation** for deploying OpenCode's control plane to AWS. Key advantages for this project:

1. **Type Safety End-to-End** - Same TypeScript codebase for app logic and infrastructure. Compile-time validation catches misconfigurations before deploy.
2. **Incremental Kubernetes Adoption** - Start with **ECS Fargate** (35 LOC to deploy agents), graduate to **EKS** when scale demands without rewriting infrastructure code.
3. **Stack-Based Multi-Tenancy** - Each team/project gets its own Pulumi stack (isolated state, resources, configs). Aligns with bounded context architecture.
4. **Automation API** - Programmatically create/update/destroy infrastructure from application code. Enables dynamic tenant provisioning.
5. **AWS Native** - First-class support for ECS, Fargate, Lambda, Step Functions, RDS, Redis. `@pulumi/awsx` provides high-level abstractions that reduce boilerplate 10x.

**Alternative considered:** Terraform with CDKTF (TypeScript support). **Rejected:** CDKTF deprecated Dec 10, 2025. HCL-only doesn't match project stack.

**Alternative considered:** SST (Ion) for exceptional DX and OpenCode synergy (same maintainers). **Rejected:** No Kubernetes support eliminates Phase 5 migration path. Re-evaluate if we abandon k8s entirely.

### Current State (Phase 0)

What exists today:

```
┌─────────────────────────────────────────────┐
│         CURRENT ARCHITECTURE                │
├─────────────────────────────────────────────┤
│                                             │
│  Single User (Developer)                    │
│       │                                     │
│       ▼                                     │
│  Next.js Web UI (apps/web/)                 │
│       │                                     │
│       ├── Multi-Server Discovery            │
│       │   └── /api/opencode-servers         │
│       │                                     │
│       ├── SSE Real-Time Sync                │
│       │   └── Zustand store + Immer         │
│       │                                     │
│       ├── Effect-TS Router System           │
│       │   └── Builder + Executor pattern    │
│       │                                     │
│       └── Session/Message UI                │
│                                             │
│  OpenCode Backend (single instance)         │
│       │                                     │
│       ├── Session Management                │
│       ├── Message/Part Streaming            │
│       ├── Provider Integration              │
│       └── Tool Orchestration                │
│                                             │
│  Local Filesystem Storage                   │
│       └── ~/.local/state/opencode/          │
│                                             │
└─────────────────────────────────────────────┘
```

**Key components already in place:**

1. **Multi-Server Discovery** - `/api/opencode-servers/route.ts` detects servers via mDNS
2. **SSE Real-Time Sync** - `use-sse.tsx` + Zustand store handle live updates
3. **Effect-TS Router** - `core/router/` provides graph-based workflow orchestration
4. **Message Streaming** - Parts update in real-time with binary search insertion

**Current limitations:**

- Single developer per OpenCode instance
- No agent-to-agent coordination primitives
- No distributed task decomposition
- Local filesystem persistence (no shared state)
- Direct SSE broadcast to all clients (no per-tenant isolation)

### The Vision: Multi-User Swarms in Kubernetes

Transform OpenCode Vibe into a **control plane** that orchestrates swarms of AI agents working collaboratively across distributed infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│              FUTURE ARCHITECTURE (k8s Swarms)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Multiple Teams (Tenants)                                       │
│       │                                                         │
│       ├── Team A (Bounded Context)                              │
│       │   ├── Developer 1 → OpenCode Vibe UI                    │
│       │   ├── Developer 2 → OpenCode Vibe UI                    │
│       │   └── Agents (pods):                                    │
│       │       ├── Coordinator (decompose tasks)                 │
│       │       ├── Worker 1 (implement feature A)                │
│       │       ├── Worker 2 (implement feature B)                │
│       │       └── Reviewer (validate PRs)                       │
│       │                                                         │
│       └── Team B (Bounded Context)                              │
│           └── Independent agent swarm...                        │
│                                                                 │
│  Control Plane (Kubernetes)                                     │
│       │                                                         │
│       ├── Task Decomposition (DAG workflows)                    │
│       ├── Agent Scheduling (pod autoscaling)                    │
│       ├── Event Bus (Redis Streams/Kafka)                       │
│       ├── Shared Memory (Mem0 + A-MEM + Zep)                    │
│       ├── File Reservations (optimistic locks)                  │
│       ├── Circuit Breakers (resilience)                         │
│       └── Observability (logs, traces, metrics)                 │
│                                                                 │
│  Persistent Storage (Multi-Tenant)                              │
│       ├── PostgreSQL (sessions, messages, agents)               │
│       ├── Vector DB (semantic memory - Mem0)                    │
│       ├── Graph DB (relationships - Zep)                        │
│       └── Object Storage (file artifacts)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Research-Backed Architecture Decisions

From semantic memory research findings, the following patterns are **prerequisites** for production swarms:

#### 1. **Graph-Based Workflow Orchestration**

- Agents decompose goals into DAGs (sequential + branching steps)
- Coordinator maintains canonical task graph, workers execute nodes
- **Already have foundation**: Effect-TS router provides builder + executor patterns

#### 2. **Event-Driven Architecture with Hybrid Coordination**

- Event-driven for independent tasks (loose coupling, scalable)
- Direct-call for dependent tasks (tight coupling, debuggable)
- **Current gap**: Global SSE broadcast needs per-tenant event filtering

#### 3. **Shared Context Between Subagents**

- **Critical finding**: Independent subagents produce conflicting outputs
- Options evaluated:
  - Shared context buffer passed to all subagents ✅
  - Event stream that all agents subscribe to ✅
  - Coordinator maintains canonical state ✅
- **Current gap**: No cross-agent context sharing mechanism

#### 4. **Hybrid Memory Architecture**

From memory research comparison:

| Component        | Technology    | Purpose                                       | Priority |
| ---------------- | ------------- | --------------------------------------------- | -------- |
| **Semantic**     | Mem0          | Vector DB + Graph DB for semantic search      | Phase 3  |
| **Adaptive**     | A-MEM         | Zettelkasten-style interconnected memories    | Phase 4  |
| **Temporal**     | Zep           | Bi-temporal graph for "what did we know when" | Phase 5  |
| **Working**      | Zustand/Immer | Current task context (in-memory)              | Phase 0  |
| **Optimization** | 90% reduction | Token cost via selective retrieval            | Phase 3+ |

#### 5. **Bounded Contexts with Clear Contracts**

- Each agent type has isolated domain model
- Communication through well-defined input/output specs
- **Current gap**: No bounded context isolation, single global instance

#### 6. **Optimistic Concurrency for Independent Work**

- Assume conflicts rare, detect at commit time (file diffs)
- Better for independent agents than pessimistic locking
- **Current gap**: No conflict detection, agents work blind

#### 7. **Observability Infrastructure**

Non-negotiable for production:

- **Logging**: Capture all agent decisions + reasoning
- **Tracing**: Track request flow through multi-agent system
- **Metrics**: Monitor performance, latency, error rates
- **Debugging**: Replay and inspect agent behavior

**Current gap**: Console logs only, no structured observability

---

## Decision

**OpenCode Vibe will evolve into a multi-user agent swarm control plane, deployed to Kubernetes, with the following phased rollout:**

### Architectural Principles

1. **Preserve What Works** - Multi-server discovery, SSE sync, Effect-TS router
2. **Add Coordination Primitives** - Task graphs, event filtering, context sharing
3. **Bounded Contexts** - Per-project/tenant isolation at infrastructure level
4. **Hybrid Orchestration** - Event-driven for parallelism, direct-call for dependencies
5. **Observability First** - Structured logging/tracing from Phase 1
6. **Incremental Complexity** - Each phase adds ONE major capability

### What We're Preserving

| Component                  | Current Implementation     | Why Preserve                             |
| -------------------------- | -------------------------- | ---------------------------------------- |
| **SSE Real-Time Sync**     | `use-sse.tsx` + Zustand    | Proven latency (<50ms), works at scale   |
| **Effect-TS Router**       | `core/router/` DAG builder | Graph orchestration foundation           |
| **Multi-Server Discovery** | `/api/opencode-servers`    | Enables swarm member discovery           |
| **Message Streaming**      | Binary search + Immer      | Efficient O(log n) updates               |
| **OpenAPI SDK**            | Generated from spec        | Type-safe client, no manual API wrappers |

### What We're Adding

| Phase  | Capability               | Technology                                | Why                                             |
| ------ | ------------------------ | ----------------------------------------- | ----------------------------------------------- |
| **P1** | Multi-Server Discovery   | mDNS + Next.js API routes                 | Already done, foundation for swarm awareness    |
| **P2** | Async Swarm Workers      | Server Actions + Effect-TS router         | Decouple task execution from UI thread          |
| **P3** | Multi-User Environment   | PostgreSQL + per-tenant event filtering   | Enable team collaboration                       |
| **P4** | Cloud Deployment         | Docker + managed Postgres + Redis Streams | Persistent state, distributed event bus         |
| **P5** | Kubernetes Orchestration | K8s + autoscaling + circuit breakers      | Agent lifecycle management, resilience at scale |

---

## Current State (Phase 0) - Deep Dive

### Multi-Server Discovery (Completed)

**File:** `apps/web/src/app/api/opencode-servers/route.ts`

Discovers OpenCode instances via mDNS:

```typescript
export async function GET(request: NextRequest) {
  const servers = await discoverServers(3000); // 3s timeout
  return Response.json({
    servers: servers.map((s) => ({
      name: s.name,
      host: s.addresses[0],
      port: s.port,
      url: `http://${s.addresses[0]}:${s.port}`,
    })),
  });
}
```

**What this enables:**

- Detect all OpenCode backend instances on local network
- Connect to multiple servers from single UI
- Foundation for swarm member discovery

**Gap for swarms:** No agent identity, no role assignment, no health checks

### SSE Real-Time Sync (Completed)

**File:** `apps/web/src/react/use-sse.tsx`

Connects to SSE endpoint, dispatches events to Zustand store:

```typescript
export function useSSE(baseUrl: string) {
  useEffect(() => {
    const client = createOpencodeClient({ baseUrl });

    async function connect() {
      const events = await client.global.event();
      for await (const event of events.stream) {
        useOpencodeStore.getState().handleSSEEvent(event);
      }
    }

    connect();
  }, [baseUrl]);
}
```

**Zustand store handles events:**

```typescript
// apps/web/src/react/store.ts
handleSSEEvent(event: GlobalEvent) {
  // Binary search insertion for messages/parts
  const index = Binary.search(state.messages, event.properties.info.id);
  if (index.found) {
    // Update existing
    state.messages[index.index] = event.properties.info;
  } else {
    // Insert at correct position
    state.messages.splice(index.index, 0, event.properties.info);
  }
}
```

**What this enables:**

- <50ms event propagation from backend to UI
- Efficient O(log n) updates via binary search
- Scales to 100s of messages per session

**Gap for swarms:** Global broadcast (no tenant filtering), no agent-to-agent events

### Effect-TS Router (Completed)

**Files:** `apps/web/src/core/router/*.ts`

Graph-based workflow orchestration with builder + executor pattern:

```typescript
// Builder: Define DAG
const workflow = RouterBuilder.create()
  .addNode("task-1", async () => {
    /* work */
  })
  .addNode("task-2", async () => {
    /* work */
  })
  .addEdge("task-1", "task-2") // Sequential dependency
  .build();

// Executor: Run workflow
const result = await RouterExecutor.execute(workflow);
```

**What this enables:**

- Sequential and parallel task execution
- Dependency resolution
- Error handling with rollback

**Gap for swarms:** No distributed execution, runs in single process

### Message/Part Streaming (Completed)

**File:** `apps/web/src/react/use-messages-with-parts.ts`

Combines messages + parts into unified stream:

```typescript
export function useMessagesWithParts(sessionID: string) {
  const messages = useOpencodeStore((state) =>
    state.messages.filter((m) => m.sessionID === sessionID),
  );

  const parts = useOpencodeStore((state) =>
    messages.flatMap((m) => state.parts[m.id] ?? []),
  );

  // Deferred value lags during rapid updates (prevents UI blocking)
  const deferredParts = useDeferredValue(parts);

  return { messages, parts: deferredParts };
}
```

**What this enables:**

- Real-time UI updates as parts stream in
- Intentional lag via `useDeferredValue` (1-2 frames) prevents blocking
- React.memo optimization for unchanged parts

**Gap for swarms:** No inter-agent part visibility, no shared "currently doing" status

---

## Phases (To Be Detailed by Subsequent Workers)

### Phase 1: Multi-Server Discovery ✅

**Status:** COMPLETE  
**Deliverable:** UI can discover and connect to multiple OpenCode instances  
**Files:** `apps/web/src/app/api/opencode-servers/route.ts`

### Phase 2: Async Swarm Workers

**Goal:** Decouple agent task execution from UI thread  
**Approach:** Server Actions spawn Effect-TS workflows in background  
**Deliverable:** Agents can work on tasks asynchronously, UI polls for status  
**Files:** TBD by subsequent worker

**Key capabilities:**

- Task decomposition into DAG
- Worker assignment to nodes
- Progress reporting via SSE
- Error recovery with retries

**Pulumi prep:**

- Design Pulumi project structure (`infra/base/`, `infra/agents/`)
- Evaluate state backend options (Pulumi Cloud SaaS vs self-hosted S3)
- Prototype ECS task definition patterns for agent containers
- Benchmark Step Functions vs ECS service-based orchestration

### Phase 3: Multi-User Environment

**Goal:** Support multiple developers working on same project  
**Approach:** Migrate from filesystem to PostgreSQL, add per-user session isolation  
**Deliverable:** Team collaboration with isolated contexts  
**Files:** TBD by subsequent worker

**Key capabilities:**

- Per-user authentication (Tailscale network auth preserved)
- Shared project state, isolated user sessions
- Event bus filtering by user/project
- Semantic memory (Mem0) for shared learnings

**Pulumi prep:**

- Stack-per-tenant design patterns (when to isolate vs share resources)
- Automation API integration for dynamic stack provisioning
- Multi-stack dependencies (base stack exports → tenant stacks import)
- Cost estimation per tenant (RDS shared vs per-tenant, resource tagging)

### Phase 4: Cloud Deployment (ECS Fargate)

**Goal:** Deploy multi-tenant agent swarms to AWS with minimal operational complexity  
**Approach:** Pulumi + ECS Fargate + RDS PostgreSQL + Redis Streams  
**Deliverable:** Production SaaS control plane with per-tenant isolation  
**Timeline:** 2-3 weeks (1 week base infra, 1 week agent services, 1 week tenant automation)

---

#### Two-Stack Architecture

Separate **long-lived base infrastructure** from **ephemeral application services**:

```
┌──────────────────────────────────────────────────────────────┐
│                    BASE STACK (infra/base/)                  │
│                  Shared across all tenants                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  VPC + Subnets (public + private)                            │
│  RDS PostgreSQL (multi-tenant with row-level security)       │
│  ElastiCache Redis (event bus for swarm coordination)        │
│  S3 Buckets (artifact storage, code snapshots)               │
│  Application Load Balancer (shared ingress)                  │
│  ECS Cluster (agent container host)                          │
│  IAM Roles (ECS task execution, CloudWatch logs)             │
│                                                              │
│  Outputs:                                                    │
│    - vpcId, subnetIds                                        │
│    - dbEndpoint, redisEndpoint                               │
│    - clusterArn, albDnsName                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
         ▲                                 ▲
         │ Stack References                │ Stack References
         │                                 │
┌────────┴──────────┐           ┌─────────┴──────────┐
│  TENANT A STACK   │           │  TENANT B STACK    │
│ (infra/tenants/)  │           │ (infra/tenants/)   │
├───────────────────┤           ├────────────────────┤
│                   │           │                    │
│  ECS Services:    │           │  ECS Services:     │
│   - Coordinator   │           │   - Coordinator    │
│   - Workers (N)   │           │   - Workers (N)    │
│   - Reviewer      │           │   - Reviewer       │
│                   │           │                    │
│  Task Definitions │           │  Task Definitions  │
│  Auto-scaling     │           │  Auto-scaling      │
│  Target Groups    │           │  Target Groups     │
│                   │           │                    │
└───────────────────┘           └────────────────────┘
```

**Why two stacks?**

1. **Base stack changes rarely** - VPC, RDS, Redis are stable. Updating them risks downtime.
2. **App stacks deploy frequently** - Agent code changes multiple times per day. Isolated deploys prevent blast radius.
3. **Cost optimization** - Shared RDS/Redis across tenants. Per-tenant ECS services scale independently.
4. **Blast radius containment** - Buggy tenant stack can't affect base infrastructure or other tenants.

---

#### Base Stack Implementation

**File:** `infra/base/index.ts`

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// --- VPC + Networking ---
const vpc = new awsx.ec2.Vpc("opencode-vpc", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 2,
  subnetStrategy: "Auto",
  natGateways: { strategy: "Single" }, // Cost optimization: 1 NAT gateway
});

// --- RDS PostgreSQL (Multi-Tenant) ---
const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet", {
  subnetIds: vpc.privateSubnetIds,
});

const dbSecurityGroup = new aws.ec2.SecurityGroup("db-sg", {
  vpcId: vpc.vpcId,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      cidrBlocks: [vpc.vpc.cidrBlock],
    },
  ],
});

const db = new aws.rds.Instance("opencode-db", {
  engine: "postgres",
  engineVersion: "16.1",
  instanceClass: "db.t4g.micro", // $13/mo, upgrade to db.r6g.large for production
  allocatedStorage: 20,
  dbName: "opencode",
  username: "admin",
  password: pulumi.secret("CHANGE_ME_IN_PRODUCTION"), // Use AWS Secrets Manager
  dbSubnetGroupName: dbSubnetGroup.name,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  skipFinalSnapshot: true, // REMOVE in production
  multiAz: false, // Enable for production (2x cost)
});

// --- ElastiCache Redis (Event Bus) ---
const redisSubnetGroup = new aws.elasticache.SubnetGroup("redis-subnet", {
  subnetIds: vpc.privateSubnetIds,
});

const redisSecurityGroup = new aws.ec2.SecurityGroup("redis-sg", {
  vpcId: vpc.vpcId,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 6379,
      toPort: 6379,
      cidrBlocks: [vpc.vpc.cidrBlock],
    },
  ],
});

const redis = new aws.elasticache.Cluster("opencode-redis", {
  engine: "redis",
  nodeType: "cache.t4g.micro", // $12/mo, upgrade to cache.r6g.large for production
  numCacheNodes: 1,
  parameterGroupName: "default.redis7",
  subnetGroupName: redisSubnetGroup.name,
  securityGroupIds: [redisSecurityGroup.id],
});

// --- S3 Artifact Storage ---
const artifactBucket = new aws.s3.Bucket("opencode-artifacts", {
  versioning: { enabled: true },
  lifecycleRules: [
    {
      enabled: true,
      expiration: { days: 90 }, // Auto-delete artifacts after 90 days
    },
  ],
});

// --- ECS Cluster ---
const cluster = new aws.ecs.Cluster("opencode-cluster", {
  settings: [
    {
      name: "containerInsights",
      value: "enabled", // CloudWatch metrics
    },
  ],
});

// --- Application Load Balancer ---
const alb = new awsx.lb.ApplicationLoadBalancer("opencode-alb", {
  subnetIds: vpc.publicSubnetIds,
  securityGroups: [
    new aws.ec2.SecurityGroup("alb-sg", {
      vpcId: vpc.vpcId,
      ingress: [
        {
          protocol: "tcp",
          fromPort: 80,
          toPort: 80,
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          protocol: "tcp",
          fromPort: 443,
          toPort: 443,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      egress: [
        { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
      ],
    }).id,
  ],
});

// --- Exports for Tenant Stacks ---
export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
export const privateSubnetIds = vpc.privateSubnetIds;
export const clusterArn = cluster.arn;
export const clusterName = cluster.name;
export const dbEndpoint = db.endpoint;
export const dbName = db.dbName;
export const redisEndpoint = redis.cacheNodes[0].address;
export const artifactBucketName = artifactBucket.bucket;
export const albDnsName = alb.loadBalancer.dnsName;
export const albListenerArn = alb.defaultTargetGroup.targetGroup.arn; // For tenant target groups
```

**Deploy:**

```bash
cd infra/base
pulumi up
# Outputs: vpcId, clusterArn, dbEndpoint, redisEndpoint, albDnsName
```

**Cost Estimate (Phase 4 - Development):**

| Resource             | Instance Type    | Monthly Cost |
| -------------------- | ---------------- | ------------ |
| RDS PostgreSQL       | db.t4g.micro     | $13          |
| ElastiCache Redis    | cache.t4g.micro  | $12          |
| NAT Gateway          | Single AZ        | $32          |
| ALB                  | Shared           | $16          |
| ECS Fargate (3 svc)  | 0.25 vCPU, 512MB | $18          |
| S3 + Data Transfer   | 100GB            | $5           |
| **TOTAL (dev)**      | **~$96/month**   |              |
| **TOTAL (prod 10x)** | **~$850/month**  | Multi-AZ RDS |

---

#### Agent Service Implementation

**File:** `infra/tenants/index.ts`

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Import base stack outputs
const baseStack = new pulumi.StackReference("opencode/base/prod");
const vpcId = baseStack.requireOutput("vpcId");
const privateSubnetIds = baseStack.requireOutput("privateSubnetIds");
const clusterArn = baseStack.requireOutput("clusterArn");
const clusterName = baseStack.requireOutput("clusterName");
const dbEndpoint = baseStack.requireOutput("dbEndpoint");
const redisEndpoint = baseStack.requireOutput("redisEndpoint");
const albListenerArn = baseStack.requireOutput("albListenerArn");

// --- ECR Repository for Agent Images ---
const repo = new awsx.ecr.Repository("agent-repo", {
  forceDelete: true, // Dev only - remove for prod
  lifecyclePolicy: {
    rules: [
      {
        selection: {
          tagStatus: "untagged",
          countType: "sinceImagePushed",
          countNumber: 7,
        },
        action: { type: "expire" },
      },
    ],
  },
});

// --- Build + Push Agent Image ---
const agentImage = new awsx.ecr.Image("agent-image", {
  repositoryUrl: repo.url,
  context: "../../apps/agent", // Path to Dockerfile
  platform: "linux/amd64",
  args: {
    NODE_ENV: "production",
  },
});

// --- IAM Role for ECS Tasks ---
const taskRole = new aws.iam.Role("agent-task-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicyAttachment("task-exec-policy", {
  role: taskRole.name,
  policyArn:
    "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// Grant access to S3, CloudWatch, Secrets Manager
new aws.iam.RolePolicy("task-permissions", {
  role: taskRole.name,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:GetObject", "s3:PutObject"],
        "Resource": "arn:aws:s3:::${baseStack.requireOutput("artifactBucketName")}/*"
      },
      {
        "Effect": "Allow",
        "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
        "Resource": "*"
      }
    ]
  }`,
});

// --- Coordinator Service (Decomposes Tasks) ---
const coordinatorService = new awsx.ecs.FargateService("coordinator", {
  cluster: clusterArn,
  assignPublicIp: false, // Private subnet
  desiredCount: 1, // Single coordinator per tenant
  taskDefinitionArgs: {
    container: {
      name: "coordinator",
      image: agentImage.imageUri,
      cpu: 256,
      memory: 512,
      environment: [
        { name: "ROLE", value: "coordinator" },
        { name: "DB_HOST", value: dbEndpoint },
        { name: "REDIS_HOST", value: redisEndpoint },
        { name: "TENANT_ID", value: pulumi.getStack() }, // Stack name = tenant ID
      ],
      portMappings: [{ containerPort: 3000 }],
    },
    taskRole: { roleArn: taskRole.arn },
  },
});

// --- Worker Service (Executes Subtasks) ---
const workerService = new awsx.ecs.FargateService("worker", {
  cluster: clusterArn,
  assignPublicIp: false,
  desiredCount: 3, // Start with 3, autoscale to 10
  taskDefinitionArgs: {
    container: {
      name: "worker",
      image: agentImage.imageUri,
      cpu: 512,
      memory: 1024,
      environment: [
        { name: "ROLE", value: "worker" },
        { name: "DB_HOST", value: dbEndpoint },
        { name: "REDIS_HOST", value: redisEndpoint },
        { name: "TENANT_ID", value: pulumi.getStack() },
      ],
    },
    taskRole: { roleArn: taskRole.arn },
  },
});

// --- Auto-Scaling (Workers scale 3-10 based on queue depth) ---
const scalingTarget = new aws.appautoscaling.Target("worker-scaling-target", {
  serviceNamespace: "ecs",
  resourceId: pulumi.interpolate`service/${clusterName}/${workerService.service.name}`,
  scalableDimension: "ecs:service:DesiredCount",
  minCapacity: 3,
  maxCapacity: 10,
});

new aws.appautoscaling.Policy("worker-scaling-policy", {
  policyType: "TargetTrackingScaling",
  resourceId: scalingTarget.resourceId,
  scalableDimension: scalingTarget.scalableDimension,
  serviceNamespace: scalingTarget.serviceNamespace,
  targetTrackingScalingPolicyConfiguration: {
    targetValue: 70.0, // Scale when CPU > 70%
    predefinedMetricSpecification: {
      predefinedMetricType: "ECSServiceAverageCPUUtilization",
    },
    scaleInCooldown: 300,
    scaleOutCooldown: 60,
  },
});

// --- Reviewer Service (Validates PRs) ---
const reviewerService = new awsx.ecs.FargateService("reviewer", {
  cluster: clusterArn,
  assignPublicIp: false,
  desiredCount: 1,
  taskDefinitionArgs: {
    container: {
      name: "reviewer",
      image: agentImage.imageUri,
      cpu: 256,
      memory: 512,
      environment: [
        { name: "ROLE", value: "reviewer" },
        { name: "DB_HOST", value: dbEndpoint },
        { name: "REDIS_HOST", value: redisEndpoint },
        { name: "TENANT_ID", value: pulumi.getStack() },
      ],
    },
    taskRole: { roleArn: taskRole.arn },
  },
});

export const coordinatorServiceName = coordinatorService.service.name;
export const workerServiceName = workerService.service.name;
export const reviewerServiceName = reviewerService.service.name;
```

**Deploy Tenant Stack:**

```bash
cd infra/tenants
pulumi stack init tenant-acme  # New tenant
pulumi config set tenantId acme
pulumi up
```

---

#### Step Functions Orchestration (Optional Enhancement)

For complex DAG workflows where ECS services aren't enough:

```typescript
// infra/tenants/step-functions.ts
const stateMachineRole = new aws.iam.Role("state-machine-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "states.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicy("state-machine-policy", {
  role: stateMachineRole.name,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["ecs:RunTask", "ecs:DescribeTasks"],
        Resource: "*",
      },
    ],
  }),
});

const orchestrator = new aws.sfn.StateMachine("swarm-orchestrator", {
  roleArn: stateMachineRole.arn,
  definition: pulumi.interpolate`{
    "Comment": "Parallel agent swarm orchestration",
    "StartAt": "Coordinator",
    "States": {
      "Coordinator": {
        "Type": "Task",
        "Resource": "arn:aws:states:::ecs:runTask.sync",
        "Parameters": {
          "LaunchType": "FARGATE",
          "Cluster": "${clusterArn}",
          "TaskDefinition": "${coordinatorService.taskDefinition.arn}",
          "Overrides": {
            "ContainerOverrides": [{
              "Name": "coordinator",
              "Environment": [
                {"Name": "TASK_ID", "Value.$": "$.taskId"}
              ]
            }]
          }
        },
        "Next": "ParallelWorkers"
      },
      "ParallelWorkers": {
        "Type": "Parallel",
        "Branches": [
          {
            "StartAt": "Worker1",
            "States": {
              "Worker1": {
                "Type": "Task",
                "Resource": "arn:aws:states:::ecs:runTask.sync",
                "Parameters": {
                  "LaunchType": "FARGATE",
                  "Cluster": "${clusterArn}",
                  "TaskDefinition": "${workerService.taskDefinition.arn}"
                },
                "End": true
              }
            }
          },
          {
            "StartAt": "Worker2",
            "States": {
              "Worker2": {
                "Type": "Task",
                "Resource": "arn:aws:states:::ecs:runTask.sync",
                "Parameters": {
                  "LaunchType": "FARGATE",
                  "Cluster": "${clusterArn}",
                  "TaskDefinition": "${workerService.taskDefinition.arn}"
                },
                "End": true
              }
            }
          }
        ],
        "Next": "Reviewer"
      },
      "Reviewer": {
        "Type": "Task",
        "Resource": "arn:aws:states:::ecs:runTask.sync",
        "Parameters": {
          "LaunchType": "FARGATE",
          "Cluster": "${clusterArn}",
          "TaskDefinition": "${reviewerService.taskDefinition.arn}"
        },
        "End": true
      }
    }
  }`,
});
```

**Trigger from application:**

```typescript
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfn = new SFNClient({ region: "us-east-1" });
await sfn.send(
  new StartExecutionCommand({
    stateMachineArn: process.env.STATE_MACHINE_ARN,
    input: JSON.stringify({ taskId: "task-123", subtasks: [...] }),
  }),
);
```

---

#### Multi-Tenancy with Automation API

Dynamically provision tenant stacks from application code:

```typescript
// apps/web/src/lib/provision-tenant.ts
import { LocalWorkspace } from "@pulumi/pulumi/automation";

export async function provisionTenant(tenantId: string) {
  const stack = await LocalWorkspace.createOrSelectStack({
    stackName: `tenant-${tenantId}`,
    workDir: "./infra/tenants",
  });

  // Set tenant-specific config
  await stack.setConfig("tenantId", { value: tenantId });
  await stack.setConfig("desiredWorkerCount", { value: "3" });

  // Deploy infrastructure
  const upResult = await stack.up({ onOutput: console.log });

  return {
    coordinatorUrl: upResult.outputs.coordinatorServiceName.value,
    workerCount: upResult.outputs.workerServiceName.value,
  };
}

// Destroy tenant infrastructure
export async function deprovisionTenant(tenantId: string) {
  const stack = await LocalWorkspace.selectStack({
    stackName: `tenant-${tenantId}`,
    workDir: "./infra/tenants",
  });

  await stack.destroy({ onOutput: console.log });
  await stack.workspace.removeStack(stack.name);
}
```

**Trigger from API route:**

```typescript
// apps/web/src/app/api/tenants/route.ts
export async function POST(request: Request) {
  const { tenantId } = await request.json();
  const result = await provisionTenant(tenantId);
  return Response.json(result);
}
```

---

#### Key Implementation Files

| Path                           | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| `infra/base/index.ts`          | VPC, RDS, Redis, S3, ALB, ECS cluster       |
| `infra/tenants/index.ts`       | Per-tenant ECS services (3 agent types)     |
| `infra/tenants/autoscaling.ts` | Worker auto-scaling policies                |
| `infra/tenants/step-fn.ts`     | Step Functions DAG orchestration (optional) |
| `apps/web/src/lib/tenant.ts`   | Automation API integration                  |

---

#### Deployment Workflow

1. **Deploy base stack** (once):

   ```bash
   cd infra/base
   pulumi up
   ```

2. **Deploy tenant stacks** (per tenant):

   ```bash
   cd infra/tenants
   pulumi stack init tenant-acme
   pulumi config set tenantId acme
   pulumi up
   ```

3. **Update agent code**:

   ```bash
   cd apps/agent
   docker build -t agent:latest .
   pulumi up  # Triggers new ECS task definition revision
   ```

4. **Auto-scaling responds to load** - Workers scale 3→10 when CPU > 70%

---

#### Cost Breakdown (Production - 10 Tenants)

| Resource                     | Config                  | Monthly Cost |
| ---------------------------- | ----------------------- | ------------ |
| **Base Stack**               |                         |              |
| RDS PostgreSQL (Multi-AZ)    | db.r6g.large            | $320         |
| ElastiCache Redis (Multi-AZ) | cache.r6g.large         | $280         |
| NAT Gateway (2 AZ)           | Dual AZ                 | $64          |
| ALB                          | Shared                  | $16          |
| **Per-Tenant Stack (x10)**   |                         |              |
| Coordinator (1 task)         | 0.25 vCPU, 512MB        | $6           |
| Workers (5 avg)              | 0.5 vCPU, 1024MB        | $30          |
| Reviewer (1 task)            | 0.25 vCPU, 512MB        | $6           |
| **Subtotal per tenant**      |                         | **$42**      |
| **10 tenants**               |                         | **$420**     |
| **Base + Tenants**           |                         | **$1,100**   |
| S3 + Data Transfer           | 500GB                   | $25          |
| CloudWatch Logs              | 50GB                    | $3           |
| **TOTAL (10 tenants, prod)** | **~$1,128/month**       |              |
| **Per tenant**               | **~$113/month** (avg)   |              |
| **At 100 tenants**           | **~$5,000/month** (est) |              |

### Phase 5: Kubernetes Orchestration (EKS Migration)

**Goal:** Migrate from ECS Fargate to EKS for advanced orchestration and ecosystem tooling  
**Approach:** Pulumi EKS + pod autoscaling + service mesh + hybrid memory  
**Deliverable:** Production-grade multi-user swarms with k8s-native patterns  
**Timeline:** 3-4 weeks (1 week EKS setup, 1 week service migration, 1 week observability, 1 week validation)

---

#### When to Migrate from ECS to EKS

**Stay on ECS Fargate if:**

- <50 tenants
- Agent workloads are stateless and short-lived
- Team lacks Kubernetes expertise
- Operational simplicity > ecosystem flexibility

**Migrate to EKS when:**

- **100+ tenants** - K8s multi-tenancy primitives (namespaces, resource quotas, network policies) scale better
- **Stateful agents** - Need persistent volumes, StatefulSets, distributed caching
- **Complex networking** - Service mesh (Istio/Linkerd), advanced traffic shaping, zero-trust networking
- **Ecosystem tooling** - Helm charts, operators (Postgres Operator, Redis Operator), GitOps (ArgoCD/Flux)
- **Cost optimization** - Spot instances, bin-packing, reserved capacity (EKS ~30% cheaper at scale vs Fargate)

**Migration triggers:**

1. Fargate costs exceed $2,000/month (EKS breaks even here)
2. Need service mesh for canary deployments, circuit breakers, retries
3. Need persistent volumes for agent state, model caching
4. Team hires SRE with k8s expertise

---

#### ECS → EKS Migration: Code Diff

**Before (ECS Fargate):**

```typescript
// infra/tenants/index.ts (Phase 4)
const workerService = new awsx.ecs.FargateService("worker", {
  cluster: clusterArn,
  desiredCount: 3,
  taskDefinitionArgs: {
    container: {
      name: "worker",
      image: agentImage.imageUri,
      cpu: 512,
      memory: 1024,
      environment: [
        { name: "ROLE", value: "worker" },
        { name: "DB_HOST", value: dbEndpoint },
      ],
    },
  },
});
```

**After (EKS):**

```typescript
// infra/tenants/index.ts (Phase 5)
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";

// --- EKS Cluster (in base stack) ---
const cluster = new eks.Cluster("opencode-eks", {
  vpcId: vpc.vpcId,
  subnetIds: privateSubnetIds,
  instanceType: "t3.medium",
  desiredCapacity: 3,
  minSize: 2,
  maxSize: 10,
  enabledClusterLogTypes: ["api", "audit", "authenticator"],
});

// --- Kubernetes Provider ---
const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig: cluster.kubeconfig,
});

// --- Worker Deployment ---
const workerDeployment = new k8s.apps.v1.Deployment(
  "worker",
  {
    metadata: { namespace: "tenant-acme" }, // Per-tenant namespace
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: "worker" } },
      template: {
        metadata: { labels: { app: "worker" } },
        spec: {
          serviceAccountName: "worker-sa", // IRSA for AWS permissions
          containers: [
            {
              name: "worker",
              image: agentImage.imageUri,
              resources: {
                requests: { cpu: "500m", memory: "1Gi" },
                limits: { cpu: "1000m", memory: "2Gi" },
              },
              env: [
                { name: "ROLE", value: "worker" },
                {
                  name: "DB_HOST",
                  valueFrom: {
                    secretKeyRef: { name: "db-secret", key: "host" },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  },
  { provider: k8sProvider },
);

// --- Horizontal Pod Autoscaler ---
const workerHPA = new k8s.autoscaling.v2.HorizontalPodAutoscaler(
  "worker-hpa",
  {
    metadata: { namespace: "tenant-acme" },
    spec: {
      scaleTargetRef: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        name: "worker",
      },
      minReplicas: 3,
      maxReplicas: 10,
      metrics: [
        {
          type: "Resource",
          resource: {
            name: "cpu",
            target: { type: "Utilization", averageUtilization: 70 },
          },
        },
      ],
    },
  },
  { provider: k8sProvider },
);

// --- Service (for internal communication) ---
const workerService = new k8s.core.v1.Service(
  "worker-svc",
  {
    metadata: { namespace: "tenant-acme" },
    spec: {
      selector: { app: "worker" },
      ports: [{ port: 3000, targetPort: 3000 }],
      type: "ClusterIP", // Internal only
    },
  },
  { provider: k8sProvider },
);
```

**Key changes:**

| ECS Concept              | EKS Equivalent                | Notes                                     |
| ------------------------ | ----------------------------- | ----------------------------------------- |
| `FargateService`         | `k8s.apps.v1.Deployment`      | Deployment manages ReplicaSets            |
| `desiredCount`           | `spec.replicas`               | Initial replica count                     |
| Task Definition          | Pod spec                      | Container, resources, env, volumes        |
| Auto-scaling (ECS)       | `HorizontalPodAutoscaler`     | CPU/memory/custom metrics                 |
| Target Group (ALB)       | `k8s.core.v1.Service`         | ClusterIP, LoadBalancer, or Ingress       |
| IAM Task Role            | IRSA (ServiceAccount + IAM)   | Pod-level AWS permissions                 |
| CloudWatch Logs          | Fluent Bit / CloudWatch Agent | DaemonSet collects logs                   |
| ECS Service Discovery    | k8s DNS (`worker-svc.tenant`) | Built-in service discovery                |
| Blue/green deploy        | Deployment rollout strategy   | `RollingUpdate`, canary with Flagger/Argo |
| Secrets (env vars)       | `k8s.core.v1.Secret`          | External Secrets Operator for AWS Secrets |
| Shared file system (EFS) | `PersistentVolumeClaim`       | EBS CSI driver or EFS CSI driver          |

---

#### IRSA Setup (IAM Roles for Service Accounts)

ECS task roles → Kubernetes service accounts with IAM bindings:

```typescript
// infra/base/irsa.ts
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

// --- OIDC Provider for EKS ---
const oidcProvider = new aws.iam.OpenIdConnectProvider("eks-oidc", {
  url: cluster.core.oidcProvider.url,
  clientIdLists: ["sts.amazonaws.com"],
  thumbprintLists: [cluster.core.oidcProvider.thumbprint],
});

// --- IAM Role for Worker Pods ---
const workerRole = new aws.iam.Role("worker-irsa-role", {
  assumeRolePolicy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "Federated": "${oidcProvider.arn}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${oidcProvider.url}:sub": "system:serviceaccount:tenant-acme:worker-sa"
        }
      }
    }]
  }`,
});

// Grant S3, CloudWatch permissions
new aws.iam.RolePolicyAttachment("worker-s3-policy", {
  role: workerRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess", // Scope down in prod
});

// --- Kubernetes ServiceAccount ---
const workerSA = new k8s.core.v1.ServiceAccount(
  "worker-sa",
  {
    metadata: {
      namespace: "tenant-acme",
      annotations: {
        "eks.amazonaws.com/role-arn": workerRole.arn,
      },
    },
  },
  { provider: k8sProvider },
);
```

**Usage in Deployment:**

```typescript
spec: {
  serviceAccountName: "worker-sa",  // Pod inherits IAM role
  containers: [...]
}
```

---

#### Ingress: Replace ALB with AWS Load Balancer Controller

**Before (ECS):** ALB target groups managed by Pulumi  
**After (EKS):** Kubernetes Ingress + AWS LB Controller

```typescript
// infra/base/lb-controller.ts
import * as k8s from "@pulumi/kubernetes";

// Install AWS LB Controller via Helm
const lbController = new k8s.helm.v3.Chart(
  "aws-lb-controller",
  {
    chart: "aws-load-balancer-controller",
    version: "1.6.0",
    namespace: "kube-system",
    fetchOpts: { repo: "https://aws.github.io/eks-charts" },
    values: {
      clusterName: cluster.eksCluster.name,
      serviceAccount: {
        create: true,
        name: "aws-load-balancer-controller",
        annotations: {
          "eks.amazonaws.com/role-arn": lbControllerRole.arn, // IRSA
        },
      },
    },
  },
  { provider: k8sProvider },
);

// --- Ingress for Coordinator Service ---
const coordinatorIngress = new k8s.networking.v1.Ingress(
  "coordinator-ingress",
  {
    metadata: {
      namespace: "tenant-acme",
      annotations: {
        "kubernetes.io/ingress.class": "alb",
        "alb.ingress.kubernetes.io/scheme": "internet-facing",
        "alb.ingress.kubernetes.io/target-type": "ip",
      },
    },
    spec: {
      rules: [
        {
          host: "tenant-acme.opencode.dev",
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: "coordinator-svc",
                    port: { number: 3000 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
  { provider: k8sProvider },
);
```

---

#### Persistent Volumes (for Stateful Agents)

ECS has no persistent storage. EKS supports EBS and EFS:

```typescript
// infra/tenants/storage.ts
const agentPVC = new k8s.core.v1.PersistentVolumeClaim(
  "agent-storage",
  {
    metadata: { namespace: "tenant-acme" },
    spec: {
      accessModes: ["ReadWriteOnce"],
      storageClassName: "gp3", // AWS EBS gp3
      resources: { requests: { storage: "20Gi" } },
    },
  },
  { provider: k8sProvider },
);

// Mount in Deployment
spec: {
  containers: [{
    volumeMounts: [{ name: "storage", mountPath: "/data" }]
  }],
  volumes: [{
    name: "storage",
    persistentVolumeClaim: { claimName: "agent-storage" }
  }]
}
```

---

#### Observability: Prometheus + Grafana + Jaeger

**Before (ECS):** CloudWatch Logs + Metrics  
**After (EKS):** Prometheus (metrics), Loki (logs), Jaeger (traces)

```typescript
// infra/base/observability.ts
const prometheus = new k8s.helm.v3.Chart(
  "prometheus",
  {
    chart: "kube-prometheus-stack",
    version: "51.0.0",
    namespace: "monitoring",
    fetchOpts: {
      repo: "https://prometheus-community.github.io/helm-charts",
    },
    values: {
      prometheus: {
        prometheusSpec: {
          retention: "30d",
          storageSpec: {
            volumeClaimTemplate: {
              spec: {
                accessModes: ["ReadWriteOnce"],
                resources: { requests: { storage: "50Gi" } },
              },
            },
          },
        },
      },
      grafana: {
        adminPassword: pulumi.secret("CHANGE_ME"),
        ingress: {
          enabled: true,
          hosts: ["grafana.opencode.dev"],
        },
      },
    },
  },
  { provider: k8sProvider },
);

const jaeger = new k8s.helm.v3.Chart(
  "jaeger",
  {
    chart: "jaeger",
    version: "0.71.0",
    namespace: "monitoring",
    fetchOpts: { repo: "https://jaegertracing.github.io/helm-charts" },
    values: {
      allInOne: { enabled: true },
      storage: { type: "memory" }, // Use Cassandra/Elasticsearch for prod
    },
  },
  { provider: k8sProvider },
);
```

**Instrument agents with OpenTelemetry:**

```typescript
// apps/agent/src/tracing.ts
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";

const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || "http://jaeger:14268/api/traces",
  }),
);
provider.register();
```

---

#### Cost Comparison: ECS Fargate vs EKS

**10 tenants, 50 agents total:**

| Resource              | ECS Fargate (Phase 4) | EKS (Phase 5) | Savings    |
| --------------------- | --------------------- | ------------- | ---------- |
| **Compute**           |                       |               |            |
| Coordinator (10)      | $60/mo                | $40/mo        | -33% (EC2) |
| Workers (40 avg)      | $240/mo               | $160/mo       | -33%       |
| Reviewer (10)         | $60/mo                | $40/mo        | -33%       |
| \*\*EKS control plane | N/A                   | $73/mo        | +$73       |
| **Total compute**     | **$360/mo**           | **$313/mo**   | **-13%**   |
| **Storage**           |                       |               |            |
| RDS PostgreSQL        | $320/mo               | $320/mo       | -          |
| ElastiCache Redis     | $280/mo               | $280/mo       | -          |
| EBS volumes           | N/A                   | $50/mo        | +$50       |
| **Total**             | **$960/mo**           | **$963/mo**   | **~same**  |

**At 100 tenants (500 agents):**

| Resource          | ECS Fargate   | EKS (spot)    | Savings     |
| ----------------- | ------------- | ------------- | ----------- |
| Compute           | $3,600/mo     | $2,100/mo     | -42% (spot) |
| EKS control plane | N/A           | $73/mo        | -           |
| Storage           | $600/mo       | $700/mo       | -           |
| **Total**         | \*_$4,200/mo_ | \*\*$2,873/mo | **-32%**    |

**Breakeven:** EKS becomes cheaper at ~50 tenants due to spot instances and bin-packing efficiency.

---

#### Migration Checklist

- [ ] Deploy EKS cluster with Pulumi (base stack)
- [ ] Install AWS LB Controller, EBS CSI driver, Metrics Server
- [ ] Create per-tenant namespaces with resource quotas
- [ ] Migrate Coordinator service (Deployment + Service + Ingress)
- [ ] Migrate Worker service (Deployment + HPA + PVC)
- [ ] Migrate Reviewer service
- [ ] Set up IRSA for all ServiceAccounts
- [ ] Configure Prometheus scraping for agent metrics
- [ ] Deploy Jaeger for distributed tracing
- [ ] Blue/green cutover: Route 10% traffic → 50% → 100%
- [ ] Decommission ECS services
- [ ] Update Pulumi stacks (archive ECS, promote EKS)

---

#### Advanced Patterns (Phase 5+)

**Service Mesh (Istio):**

```typescript
const istio = new k8s.helm.v3.Chart("istio-base", {
  chart: "base",
  version: "1.19.0",
  namespace: "istio-system",
  fetchOpts: { repo: "https://istio-release.storage.googleapis.com/charts" },
});

// Enable for tenant namespace
new k8s.core.v1.Namespace("tenant-acme", {
  metadata: {
    labels: { "istio-injection": "enabled" }, // Auto-inject sidecar
  },
});
```

**GitOps (ArgoCD):**

```typescript
const argocd = new k8s.helm.v3.Chart("argocd", {
  chart: "argo-cd",
  version: "5.46.0",
  namespace: "argocd",
  fetchOpts: { repo: "https://argoproj.github.io/argo-helm" },
});

// Define app-of-apps pattern
new k8s.apiextensions.CustomResource("tenant-apps", {
  apiVersion: "argoproj.io/v1alpha1",
  kind: "Application",
  metadata: { name: "tenants", namespace: "argocd" },
  spec: {
    source: { repoURL: "https://github.com/opencode/tenants", path: "." },
    destination: { server: "https://kubernetes.default.svc" },
    syncPolicy: { automated: { prune: true, selfHeal: true } },
  },
});
```

---

## Pulumi Implementation Details

### Directory Structure

```
opencode-next/
├── infra/
│   ├── base/
│   │   ├── index.ts              # VPC, RDS, Redis, S3, ALB, ECS cluster
│   │   ├── network.ts            # VPC config, subnets, NAT gateways
│   │   ├── database.ts           # RDS PostgreSQL with multi-tenant schema
│   │   ├── cache.ts              # ElastiCache Redis for event bus
│   │   ├── storage.ts            # S3 buckets for artifacts
│   │   ├── load-balancer.ts      # Application Load Balancer
│   │   ├── irsa.ts               # OIDC provider + IAM roles (EKS only)
│   │   ├── observability.ts      # Prometheus, Grafana, Jaeger (EKS only)
│   │   ├── Pulumi.yaml           # Project config
│   │   └── Pulumi.prod.yaml      # Stack config (prod env)
│   │
│   ├── tenants/
│   │   ├── index.ts              # ECS services or k8s Deployments
│   │   ├── coordinator.ts        # Coordinator service definition
│   │   ├── worker.ts             # Worker service + auto-scaling
│   │   ├── reviewer.ts           # Reviewer service
│   │   ├── autoscaling.ts        # ECS/HPA scaling policies
│   │   ├── step-functions.ts     # Step Functions DAG (optional)
│   │   ├── Pulumi.yaml           # Tenant project config
│   │   └── Pulumi.tenant-*.yaml  # Per-tenant stack configs
│   │
│   └── shared/
│       ├── types.ts              # Shared Pulumi types
│       ├── config.ts             # Environment-specific configs
│       └── helpers.ts            # Reusable Pulumi components
│
├── apps/
│   ├── agent/
│   │   ├── Dockerfile            # Agent container image
│   │   ├── src/
│   │   │   ├── coordinator.ts    # Task decomposition logic
│   │   │   ├── worker.ts         # Subtask execution logic
│   │   │   ├── reviewer.ts       # PR validation logic
│   │   │   └── tracing.ts        # OpenTelemetry instrumentation
│   │   └── package.json
│   │
│   └── web/
│       └── src/
│           └── lib/
│               ├── provision-tenant.ts  # Automation API integration
│               └── tenant-status.ts     # Query stack outputs
│
└── package.json                  # Workspace root
```

---

### Dependencies

**Phase 4 (ECS Fargate):**

```json
{
  "devDependencies": {
    "@pulumi/pulumi": "^3.100.0",
    "@pulumi/aws": "^6.15.0",
    "@pulumi/awsx": "^2.5.0",
    "@pulumi/docker": "^4.5.0",
    "typescript": "^5.3.0"
  }
}
```

**Phase 5 (EKS):**

```json
{
  "devDependencies": {
    "@pulumi/pulumi": "^3.100.0",
    "@pulumi/aws": "^6.15.0",
    "@pulumi/awsx": "^2.5.0",
    "@pulumi/eks": "^2.0.0",
    "@pulumi/kubernetes": "^4.5.0",
    "@pulumi/docker": "^4.5.0",
    "typescript": "^5.3.0"
  }
}
```

**Install:**

```bash
cd infra/base
bun add -d @pulumi/pulumi @pulumi/aws @pulumi/awsx
```

---

### State Management

Pulumi stores infrastructure state in backends. Three options:

#### 1. Pulumi Cloud (SaaS - Recommended for Phase 4)

**Pros:**

- Zero setup, managed service
- Built-in encryption, RBAC, audit logs
- Team tier: $58/month for 100 resources
- Handles state locking automatically

**Setup:**

```bash
pulumi login  # Interactive OAuth flow
pulumi stack init prod
pulumi up
```

**Config:**

```yaml
# Pulumi.yaml
name: opencode-base
runtime: nodejs
backend:
  url: https://app.pulumi.com/opencode-team # Default, can omit
```

#### 2. Self-Hosted (S3 Backend - For Cost Control)

**Pros:**

- Free (S3 storage only, ~$0.50/month)
- Full control, no vendor lock-in
- Works air-gapped

**Setup:**

```bash
aws s3 mb s3://opencode-pulumi-state
pulumi login s3://opencode-pulumi-state
```

**Config:**

```yaml
# Pulumi.yaml
name: opencode-base
runtime: nodejs
backend:
  url: s3://opencode-pulumi-state
```

**State locking:** Pulumi uses DynamoDB for lock coordination automatically.

#### 3. Local Filesystem (Dev Only)

**Pros:**

- Zero dependencies, fastest iteration
- No network calls

**Cons:**

- No collaboration, no locking, risk of corruption

**Setup:**

```bash
pulumi login --local
```

**Recommendation:** Use Pulumi Cloud for Phase 4 (team collaboration), migrate to S3 if cost becomes concern (100+ stacks).

---

### Stack Configuration

**Base stack (long-lived):**

```yaml
# infra/base/Pulumi.prod.yaml
config:
  aws:region: us-east-1
  opencode-base:vpcCidr: "10.0.0.0/16"
  opencode-base:dbInstanceClass: "db.r6g.large" # Prod
  opencode-base:redisNodeType: "cache.r6g.large" # Prod
  opencode-base:enableMultiAz: true # Prod only
```

**Tenant stack (ephemeral):**

```yaml
# infra/tenants/Pulumi.tenant-acme.yaml
config:
  aws:region: us-east-1
  opencode-tenants:tenantId: "acme"
  opencode-tenants:coordinatorCount: 1
  opencode-tenants:workerMinCount: 3
  opencode-tenants:workerMaxCount: 10
  opencode-tenants:enableStepFunctions: false # Use ECS services
```

**Access in code:**

```typescript
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const tenantId = config.require("tenantId");
const workerMin = config.getNumber("workerMinCount") ?? 3;
```

---

### CI/CD Integration

**GitHub Actions workflow:**

```yaml
# .github/workflows/deploy-base.yml
name: Deploy Base Stack
on:
  push:
    branches: [main]
    paths: ["infra/base/**"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: cd infra/base && bun install

      - name: Pulumi login
        run: pulumi login
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}

      - name: Deploy base stack
        run: cd infra/base && pulumi up --yes --stack prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

**Tenant deployment (Automation API):**

```yaml
# .github/workflows/deploy-tenant.yml
name: Deploy Tenant
on:
  workflow_dispatch:
    inputs:
      tenantId:
        description: "Tenant ID"
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Provision tenant
        run: |
          cd apps/web
          bun run provision-tenant --tenant-id ${{ github.event.inputs.tenantId }}
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

### Multi-Stack Dependencies

**Base stack exports:**

```typescript
// infra/base/index.ts
export const vpcId = vpc.vpcId;
export const clusterArn = cluster.arn;
export const dbEndpoint = db.endpoint;
```

**Tenant stack imports:**

```typescript
// infra/tenants/index.ts
import * as pulumi from "@pulumi/pulumi";

const baseStack = new pulumi.StackReference("opencode/base/prod");
const vpcId = baseStack.requireOutput("vpcId");
const clusterArn = baseStack.requireOutput("clusterArn");

// Use in resources
const service = new awsx.ecs.FargateService("worker", {
  cluster: clusterArn, // From base stack
  // ...
});
```

**Automated dependency resolution:** Pulumi waits for base stack outputs before deploying tenant stack.

---

### Cost Tagging

Tag all resources for cost attribution:

```typescript
// infra/shared/config.ts
export function getTags(tenantId?: string) {
  return {
    Project: "OpenCode",
    ManagedBy: "Pulumi",
    Environment: pulumi.getStack(),
    ...(tenantId && { TenantId: tenantId }),
  };
}

// Usage
const bucket = new aws.s3.Bucket("artifacts", {
  tags: getTags(),
});

const service = new awsx.ecs.FargateService("worker", {
  tags: getTags("acme"),
});
```

**AWS Cost Explorer query:** Filter by `TenantId` tag to see per-tenant spend.

---

### Secrets Management

**NEVER hardcode secrets in Pulumi code.** Use Pulumi config secrets:

```bash
# Encrypt values in stack config
pulumi config set --secret dbPassword "super-secret-password"
pulumi config set --secret redisPassword "another-secret"
```

**Access in code:**

```typescript
const config = new pulumi.Config();
const dbPassword = config.requireSecret("dbPassword"); // Returns Output<string>

const db = new aws.rds.Instance("db", {
  password: dbPassword, // Pulumi handles encryption
});
```

**For AWS Secrets Manager integration:**

```typescript
import * as aws from "@pulumi/aws";

const secret = new aws.secretsmanager.Secret("db-credentials");
const secretVersion = new aws.secretsmanager.SecretVersion(
  "db-credentials-v1",
  {
    secretId: secret.id,
    secretString: JSON.stringify({
      username: "admin",
      password: config.requireSecret("dbPassword"),
    }),
  },
);

// Reference in ECS task
environment: [
  {
    name: "DB_PASSWORD",
    valueFrom: secretVersion.arn,
  },
];
```

---

### Rollback Strategy

**Pulumi maintains full state history.** Rollback to previous deployment:

```bash
# List stack history
pulumi stack history

# Rollback to specific version
pulumi stack export --version 42 > stack-v42.json
pulumi stack import --file stack-v42.json
pulumi up  # Apply rolled-back state
```

**Automated rollback on failure:**

```typescript
// infra/tenants/index.ts
import * as pulumi from "@pulumi/pulumi/automation";

const stack = await LocalWorkspace.createOrSelectStack({
  stackName: "tenant-acme",
  workDir: "./infra/tenants",
});

try {
  const upResult = await stack.up({ onOutput: console.log });
  console.log("Deployed:", upResult.summary);
} catch (error) {
  console.error("Deploy failed, rolling back...");
  await stack.cancel(); // Rollback in-progress update
  throw error;
}
```

---

### Preview Changes (Dry Run)

**ALWAYS preview before deploying:**

```bash
pulumi preview        # Show what will change
pulumi preview --diff # Show code-level diffs
```

**CI/CD integration:**

```yaml
- name: Preview changes
  run: cd infra/base && pulumi preview --diff > preview.txt

- name: Comment on PR
  uses: actions/github-script@v6
  with:
    script: |
      const fs = require("fs");
      const preview = fs.readFileSync("preview.txt", "utf8");
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        body: `## Pulumi Preview\n\`\`\`\n${preview}\n\`\`\``,
      });
```

---

## Consequences

### Positive

1. **Scales to Teams** - Multi-user support enables team collaboration, not just single-developer workflows
2. **Agent Specialization** - Coordinator/worker/reviewer roles enable division of labor
3. **Fault Tolerance** - Kubernetes + circuit breakers prevent cascade failures
4. **Cost Efficiency** - Autoscaling agents based on load reduces idle compute
5. **Shared Learning** - Mem0 semantic memory enables agents to learn from each other's work
6. **Production Ready** - Observability + error recovery make swarms reliable enough to trust
7. **Flexible Deployment** - Can run on localhost (Phase 0), cloud (Phase 4), or k8s (Phase 5)

### Negative

1. **Complexity Explosion** - Each phase adds significant operational complexity
2. **Storage Migration Risk** - Filesystem → Postgres migration could lose data without careful planning
3. **Distributed Systems Challenges** - Event ordering, consistency, partition tolerance
4. **Cost of Coordination** - Agent-to-agent communication overhead vs independent execution
5. **Vendor Lock-In** - Kubernetes, cloud-specific services reduce portability
6. **Learning Curve** - Team needs expertise in distributed systems, k8s, observability

### Risks & Mitigations

| Risk                                 | Probability | Impact | Mitigation                                                    |
| ------------------------------------ | ----------- | ------ | ------------------------------------------------------------- |
| **Event bus performance bottleneck** | Medium      | High   | Benchmark Redis Streams early, prototype filtering in Phase 2 |
| **Agent coordination overhead**      | High        | Medium | Use hybrid orchestration (event-driven + direct-call)         |
| **Storage migration data loss**      | Low         | High   | Export filesystem state to JSON before Postgres migration     |
| **k8s operational complexity**       | High        | Medium | Hire SRE, use managed k8s (EKS/GKE), start simple             |
| **Memory system integration**        | Medium      | Medium | Prototype Mem0 in Phase 3, defer A-MEM/Zep to Phase 5         |
| **Observability gaps**               | Medium      | High   | Add structured logging in Phase 1, tracing in Phase 2         |

---

## Implementation Notes

### Phase 0 Foundations Already in Place

**No additional work required for Phase 0.** The following components are production-ready:

- ✅ Multi-server discovery (`/api/opencode-servers`)
- ✅ SSE real-time sync (`use-sse.tsx` + Zustand)
- ✅ Effect-TS router (`core/router/`)
- ✅ Message streaming (binary search + Immer)
- ✅ Next.js 16 web UI (ADR-001)

**Next step:** Assign Phase 1 worker to detail async swarm orchestration.

### Key Architectural Constraints

From research findings, these are **non-negotiable** for production swarms:

1. **Context sharing between agents** - Prevents conflicting outputs
2. **Bounded contexts** - Per-project/tenant isolation
3. **Hybrid orchestration** - Event-driven for parallelism, direct-call for dependencies
4. **Observability infrastructure** - Logging, tracing, metrics from Day 1
5. **Optimistic concurrency** - File-level conflict detection, not pessimistic locks
6. **Human-in-the-loop** - Approval checkpoints for high-stakes decisions

### Technology Decisions Deferred

The following decisions are intentionally deferred to later phases:

- **Event bus choice** (Redis Streams vs Kafka) - Phase 4
- **Memory system details** (Mem0 vs A-MEM vs Zep) - Phase 3-5
- **Kubernetes platform** (EKS vs GKE vs self-managed) - Phase 5
- **Monitoring stack** (Datadog vs New Relic vs Prometheus) - Phase 4

**Why defer?** Let patterns emerge from earlier phases before committing to specific technologies.

### Technology Decisions Made

- **Infrastructure-as-Code:** Pulumi (TypeScript SDK, ECS → EKS migration path, stack-based multi-tenancy)

---

## Alternatives Considered

### Alternative 1: Fix Current Single-User Architecture

**Approach:** Enhance existing backend with better task orchestration, no UI changes  
**Rejected because:**

- Doesn't solve multi-user problem
- Filesystem storage doesn't scale to teams
- Global SSE broadcast breaks with tenant isolation

### Alternative 2: Microservices from Day 1

**Approach:** Build Phase 5 architecture immediately (k8s, distributed services)  
**Rejected because:**

- Massive upfront complexity
- No validated patterns yet
- Premature optimization
- Team doesn't have distributed systems expertise

**Our choice:** Phased rollout lets us learn and adapt

### Alternative 3: Serverless-Only (No Kubernetes)

**Approach:** Use Lambda/Cloud Functions for all agents, no k8s  
**Rejected because:**

- Cold starts kill agent responsiveness
- Stateful agents (memory, context) don't fit serverless model
- Cost at scale (per-invocation pricing)

**Our choice:** Hybrid (serverless + k8s) in Phase 4+

### Alternative 4: Infrastructure-as-Code Tool Selection

**Context:** Phase 4 and Phase 5 require infrastructure automation for deploying control plane components (ECS, Lambda, Kubernetes, event bus, storage). Need to evaluate IaC tools for TypeScript DX, AWS integration, and multi-tenancy support.

**Tools evaluated:**

#### Pulumi

- **AWS Integration:** Excellent. Native TypeScript SDK for ECS Fargate, Lambda, EKS, Step Functions. AWSX package provides high-level abstractions
- **TypeScript DX:** Best-in-class. Full type inference, IDE autocomplete, compile-time errors
- **Kubernetes Dependency:** NONE (optional). Can use ECS Fargate without k8s
- **Multi-tenancy:** Stack-based isolation. Each stack = bounded context
- **State Management:** Pulumi Cloud (SaaS) or self-hosted (S3/PostgreSQL). Team tier ~$58/mo for 100 resources
- **Agent Orchestration:** ECS Fargate for long-running agents (Lambda 15min limit). Step Functions for DAG workflows
- **Recommendation:** Start with ECS Fargate (no k8s), graduate to EKS later if needed

#### Terraform

- **CRITICAL:** CDKTF deprecated Dec 10, 2025. No TypeScript option. HCL-only
- **AWS Integration:** Excellent. Battle-tested modules for ECS, Lambda, EKS
- **Agent Orchestration:** Defines desired state only, not runtime orchestration. Needs external orchestrator for dynamic agent spawning
- **Multi-tenancy:** Module pattern with per-tenant state backends
- **Kubernetes Dependency:** Optional. Works with ECS-native, Lambda-native, or EKS
- **Recommendation:** Good for infrastructure provisioning, needs supplement for runtime orchestration

#### SST (Ion)

- **AWS Integration:** Excellent for serverless. ECS Cluster, SQS Queue, StepFunctions, Realtime (IoT WebSockets)
- **TypeScript DX:** Exceptional. Resource Linking auto-generates typed SDK. `$concat`, `$interpolate` helpers
- **Kubernetes Support:** NONE. Lambda/ECS/Fargate focused only
- **Multi-tenancy:** Manual. No built-in primitives
- **OpenCode Synergy:** Same maintainers (Jay @ SST). Dogfooding potential. Resource Linking SDK supports TS/Python/Go/Rust
- **Recommendation:** Best DX for AWS-native serverless, but no k8s path

#### Comparison Table

| Criteria                  | Pulumi           | Terraform          | SST            |
| ------------------------- | ---------------- | ------------------ | -------------- |
| **TypeScript Support**    | Native (best)    | None (HCL only)    | Native (best)  |
| **AWS Integration**       | Excellent        | Excellent          | Excellent      |
| **Kubernetes Path**       | Optional (EKS)   | Optional (EKS)     | None           |
| **Multi-tenancy**         | Stack-based      | Module-based       | Manual         |
| **State Management**      | SaaS/self-hosted | S3/Terraform Cloud | SaaS           |
| **Runtime Orchestration** | Step Functions   | Needs external     | Step Functions |
| **Cost**                  | $58/mo (team)    | Free (OSS)         | Free (OSS)     |

**Decision:** **Pulumi for Phase 4 and Phase 5**

**Rationale:**

1. **TypeScript-First DX** - Matches project stack, compile-time validation, IDE support
2. **Incremental Kubernetes Adoption** - Start with ECS Fargate (Phase 4), graduate to EKS (Phase 5) without rewriting
3. **Stack-Based Multi-tenancy** - Each bounded context = Pulumi stack, aligns with architectural principles
4. **State Flexibility** - Can self-host state backend, no vendor lock-in

**SST Consideration:** While SST offers exceptional DX and OpenCode synergy (same maintainers), the lack of Kubernetes support eliminates it for Phase 5. **Re-evaluate if we abandon k8s path.**

---

## Success Metrics

| Phase  | Key Metric                                | Target            |
| ------ | ----------------------------------------- | ----------------- |
| **P0** | Multi-server discovery latency            | <3s               |
| **P1** | SSE event propagation                     | <50ms             |
| **P2** | Task decomposition → first agent assigned | <2s               |
| **P3** | Concurrent users per project              | 10+               |
| **P4** | Agent spawn latency (cloud)               | <5s               |
| **P5** | Agent autoscaling response time           | <30s              |
| **P5** | Token cost reduction (semantic memory)    | 90%               |
| **P5** | Swarm coordination overhead               | <10% of work time |

---

## References

### Research Sources (Semantic Memory)

- **Memory ID:** `9f0fb44f-62c3-4431-b055-48fe9166e35a` - Multi-agent coordination patterns
- **Memory ID:** `8f40a346-1d73-4b68-a4ef-63bac426e88a` - Memory architecture comparison (Mem0, A-MEM, Zep)
- **Memory ID:** `1798ca87-9fae-4357-a50b-9435ba26e2ff` - ADR documentation patterns

### Key Insights Applied

1. **Graph-based workflow orchestration** → Effect-TS router (already implemented)
2. **Shared context buffer** → Deferred to Phase 2 (async worker context)
3. **Bounded contexts** → Phase 3 (per-tenant isolation)
4. **Hybrid orchestration** → Architectural principle, applied all phases
5. **Mem0 for semantic memory** → Phase 3 (90% token reduction)
6. **Observability prerequisite** → Phase 1+ (structured logging)

### Internal References

- **ADR-001:** Next.js Rebuild (`docs/adr/001-nextjs-rebuild.md`)
- **Effect-TS Router:** `apps/web/src/core/router/*.ts`
- **SSE Integration:** `apps/web/src/react/use-sse.tsx`
- **Multi-Server Discovery:** `apps/web/src/app/api/opencode-servers/route.ts`

### External Technologies

- **Mem0:** https://github.com/mem0ai/mem0 (semantic memory)
- **A-MEM:** https://github.com/OpenBMB/A-MEM (adaptive memory)
- **Zep:** https://github.com/getzep/zep (temporal knowledge graph)
- **Effect-TS:** https://effect.website (functional programming)
- **Redis Streams:** https://redis.io/docs/data-types/streams/ (event bus)

---

## Questions for Discussion

1. **Phase 2 Scope:** Should async workers use Server Actions or separate worker processes?
2. **Event Bus:** Redis Streams vs Kafka for Phase 4? What's the latency/cost tradeoff?
3. **Memory Priority:** Mem0 first (Phase 3) or defer all memory to Phase 5?
4. **Observability:** Datadog vs self-hosted Prometheus? Budget implications?
5. **Migration Path:** How do we migrate existing users from Phase 0 (localhost) to Phase 4 (cloud)?
6. **Human-in-the-Loop:** Where should approval checkpoints live? UI or backend?

---

## Approval

- [ ] Architecture Lead
- [ ] Team Lead
- [ ] Product Lead
- [ ] DevOps/SRE Lead (for Phase 4+)

---

## Changelog

| Date       | Author     | Change                                                                  |
| ---------- | ---------- | ----------------------------------------------------------------------- |
| 2025-12-29 | BoldHawk   | Initial proposal, Phase 0 documentation                                 |
| 2025-12-29 | GreenCloud | Added IaC tool comparison and Pulumi decision                           |
| 2025-12-29 | CalmForest | Status: Accepted. Full Pulumi overhaul with ECS/EKS implementation code |
