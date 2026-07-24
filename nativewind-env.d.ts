/// <reference types="nativewind/types" />

declare module '*.png';
declare module '*.svg' {
	const content: string;
	export default content;
}
