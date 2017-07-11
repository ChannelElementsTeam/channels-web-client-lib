
export interface ComponentRequest {
  package: string;  // appropriate to be passed to bower install <package>
}

export interface ComponentDescriptor {
  composerTag: string;
  viewerTag: string;
}

export interface BowerPackage {
  name: string;
  main: string;
  license: string;
  description?: string;
  homepage?: string;
  authors?: string[];
  keywords?: string[];
}

export interface ComponentResponse {
  source: string;
  packageName: string;
  importHref: string;
  package: BowerPackage;
  channelComponent: ComponentDescriptor;
}
