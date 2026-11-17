import { z } from "zod";

/** Project domains (BRD-DOM-01). */
export const DOMAINS = ["BFSI", "MUTUAL_FUNDS", "GENERAL"] as const;
export const DomainSchema = z.enum(DOMAINS);
export type Domain = z.infer<typeof DomainSchema>;
export const DOMAIN_LABELS: Record<Domain, string> = { BFSI: "BFSI", MUTUAL_FUNDS: "Mutual Funds", GENERAL: "General" };

/** BFSI client entity type decides which regulation applies. */
export const ENTITY_TYPES = ["COMMERCIAL_BANK", "NBFC_OTHER_BANK", "PAYMENT_OPERATOR", "INSURER", "AMC", "OTHER"] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;
export const ENTITY_LABELS: Record<EntityType, string> = {
  COMMERCIAL_BANK: "Commercial bank",
  NBFC_OTHER_BANK: "NBFC, small finance or payments bank",
  PAYMENT_OPERATOR: "Non-bank payment system operator",
  INSURER: "Insurer or insurance intermediary",
  AMC: "Mutual Fund or AMC",
  OTHER: "Other",
};

/** Gated phases, in order (projects overview pipeline). */
export const PHASES = [
  "INTAKE",
  "BRD",
  "CLIENT_SIGNOFF",
  "FSD",
  "DESIGN",
  "API_SPEC",
  "STACK",
  "DEVELOPMENT",
  "TESTING",
] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABELS: Record<Phase, string> = {
  INTAKE: "Intake",
  BRD: "BRD",
  CLIENT_SIGNOFF: "Client gate",
  FSD: "FSD",
  DESIGN: "UI/UX design",
  API_SPEC: "API spec",
  STACK: "Tech stack",
  DEVELOPMENT: "Development",
  TESTING: "Testing tracker",
};

export const PLATFORMS = ["Web", "Mobile iOS", "Mobile Android", "Tablet", "Desktop", "API", "Integration"] as const;

export interface ChecklistItem {
  id: string;
  name: string;
  version: string;
  /** How a developer checks it on their machine. */
  verify: string;
  required: boolean;
}

export interface StackDef {
  key: string;
  name: string;
  summary: string;
  layers: { frontend: string; backend: string; database: string; mobile?: string };
  platforms: string[];
  /** Stack-specific guardrail topic keys (see guardrail catalogue). */
  topics: string[];
  checklist: ChecklistItem[];
}

const common: ChecklistItem[] = [
  { id: "git", name: "Git", version: "2.4x or later", verify: "git --version", required: true },
  { id: "ide", name: "VS Code or JetBrains IDE", version: "Current", verify: "Open the IDE", required: true },
  { id: "ai-tool", name: "Approved AI coding tool (Claude Code, Copilot or Codex)", version: "Org licence", verify: "Signed in with your Idealake account", required: true },
  { id: "docker", name: "Docker Desktop", version: "4.x", verify: "docker --version", required: true },
];

/** Stack catalogue. Tech Architects pick one per project (BRD-RBAC-04). Versions are editable defaults. */
export const STACKS: StackDef[] = [
  {
    key: "flutter-nest",
    name: "Flutter mobile + NestJS API",
    summary: "Cross-platform mobile app with a TypeScript API. Deepest in-house experience (pilot technology).",
    layers: { frontend: "Flutter (Dart)", mobile: "Flutter for iOS and Android", backend: "NestJS on Node.js 22 LTS", database: "PostgreSQL 16" },
    platforms: ["Mobile iOS", "Mobile Android", "Tablet", "API"],
    topics: ["flutter", "node"],
    checklist: [
      ...common,
      { id: "flutter", name: "Flutter SDK", version: "Latest stable 3.x", verify: "flutter --version", required: true },
      { id: "android", name: "Android Studio and SDK", version: "Current", verify: "flutter doctor", required: true },
      { id: "xcode", name: "Xcode (macOS only)", version: "Current", verify: "xcodebuild -version", required: false },
      { id: "node", name: "Node.js", version: "22 LTS", verify: "node -v", required: true },
      { id: "pnpm", name: "pnpm", version: "10.x", verify: "pnpm -v", required: true },
    ],
  },
  {
    key: "next-nest",
    name: "Next.js web + NestJS API",
    summary: "Server-rendered web application and TypeScript API.",
    layers: { frontend: "Next.js 16 (React 19, TypeScript)", backend: "NestJS on Node.js 22 LTS", database: "PostgreSQL 16" },
    platforms: ["Web", "API"],
    topics: ["react", "node"],
    checklist: [
      ...common,
      { id: "node", name: "Node.js", version: "22 LTS", verify: "node -v", required: true },
      { id: "pnpm", name: "pnpm", version: "10.x", verify: "pnpm -v", required: true },
    ],
  },
  {
    key: "react-native-nest",
    name: "React Native mobile + NestJS API",
    summary: "React Native app for iOS and Android with a TypeScript API.",
    layers: { frontend: "React Native (TypeScript)", mobile: "React Native for iOS and Android", backend: "NestJS on Node.js 22 LTS", database: "PostgreSQL 16" },
    platforms: ["Mobile iOS", "Mobile Android", "API"],
    topics: ["react-native", "node"],
    checklist: [
      ...common,
      { id: "node", name: "Node.js", version: "22 LTS", verify: "node -v", required: true },
      { id: "jdk", name: "JDK", version: "17", verify: "java -version", required: true },
      { id: "android", name: "Android Studio and SDK", version: "Current", verify: "adb --version", required: true },
      { id: "xcode", name: "Xcode and CocoaPods (macOS only)", version: "Current", verify: "pod --version", required: false },
    ],
  },
  {
    key: "angular-dotnet",
    name: "Angular web + ASP.NET Core API",
    summary: "Enterprise web application on .NET.",
    layers: { frontend: "Angular (TypeScript)", backend: "ASP.NET Core on .NET 10 LTS", database: "SQL Server 2022" },
    platforms: ["Web", "API"],
    topics: ["dotnet"],
    checklist: [
      ...common,
      { id: "dotnet", name: ".NET SDK", version: "10 LTS", verify: "dotnet --version", required: true },
      { id: "node", name: "Node.js", version: "22 LTS", verify: "node -v", required: true },
      { id: "angular-cli", name: "Angular CLI", version: "Current", verify: "ng version", required: true },
    ],
  },
  {
    key: "react-spring",
    name: "React web + Spring Boot API",
    summary: "React front end with a Java API, common for bank integrations.",
    layers: { frontend: "React 19 (TypeScript, Vite)", backend: "Spring Boot 3 on Java 21 LTS", database: "PostgreSQL 16" },
    platforms: ["Web", "API", "Integration"],
    topics: ["react", "java"],
    checklist: [
      ...common,
      { id: "jdk", name: "JDK", version: "21 LTS", verify: "java -version", required: true },
      { id: "maven", name: "Maven or Gradle", version: "Current", verify: "mvn -v", required: true },
      { id: "node", name: "Node.js", version: "22 LTS", verify: "node -v", required: true },
    ],
  },
];

export function findStack(key: string | null | undefined): StackDef | undefined {
  return STACKS.find((s) => s.key === key);
}
