import { storage as draftStorage } from '../../libs/storage';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: 'draft-test' }) }));
jest.mock('@react-navigation/native', () => ({ NavigationRouteContext: require('react').createContext(undefined) }));
import React from "react";
import {fireEvent,render} from "@testing-library/react-native";
import {ProjectReviewPanel} from "../../components/editor/ProjectReviewPanel";
import type {useCloudProjects} from "../../libs/editor/useCloudProjects";
jest.mock("react-native-css-interop/jsx-runtime",()=>jest.requireActual("react/jsx-runtime"));
jest.mock("react-native",()=>({View:"View",Text:"Text",TextInput:"TextInput",Pressable:"Pressable",StyleSheet:{flatten:(style:unknown)=>style}}));
jest.mock("react-i18next",()=>({useTranslation:()=>({t:(key:string)=>key})}));
jest.mock("../../components/ui/Icon",()=>()=>null);
const actor="0x"+"b".repeat(40),owner="0x"+"a".repeat(40);
function setup(role:"viewer"|"editor"){
  const openShared=jest.fn(),openReview=jest.fn();
  const cloud={available:true,busy:false,review:{ownerWallet:owner,projectId:"shared",title:"Shared film",revision:4,role},comments:[],members:[],openShared,openReview,clearReview:jest.fn()} as unknown as ReturnType<typeof useCloudProjects>;
  return {cloud,openShared,openReview};
}
it("offers the actual shared-edit button to editors while keeping copy separate",()=>{
  const env=setup("editor"),screen=render(<ProjectReviewPanel cloud={env.cloud} wallet={actor}/>);
  fireEvent.press(screen.getByLabelText("common.edit"));expect(env.openShared).toHaveBeenCalledTimes(1);expect(env.openReview).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("common.copy"));expect(env.openReview).toHaveBeenCalledTimes(1);
});
it("does not offer shared saves to viewers",()=>{
  const env=setup("viewer"),screen=render(<ProjectReviewPanel cloud={env.cloud} wallet={actor}/>);
  expect(screen.queryByLabelText("common.edit")).toBeNull();fireEvent.press(screen.getByLabelText("common.copy"));expect(env.openReview).toHaveBeenCalledTimes(1);expect(env.openShared).not.toHaveBeenCalled();
});

beforeEach(() => { draftStorage.delete('dehub-drafts-v1'); __resetDraftCacheForTests(); });
