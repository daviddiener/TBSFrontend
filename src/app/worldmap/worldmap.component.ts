import { Component, OnInit} from '@angular/core';
import { RegionService } from '../services/region.service';
import { Region, Type } from '../_models/region';
import Phaser, { Cameras } from 'phaser';
import { FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-worldmap',
  templateUrl: './worldmap.component.html',
  styleUrls: ['./worldmap.component.css']
})
export class WorldmapComponent implements OnInit {
  regions: Region[] = [];
  selectedRegion: Region;
  regionId: number = null;
  currentPage = 1;
  pageLimit = 10;
  range = new FormControl(15, [Validators.max(30), Validators.min(5)]);

  phaserGame: Phaser.Game;
  config: Phaser.Types.Core.GameConfig;
  msc: MainScene;

  constructor(private regionService: RegionService, private route: ActivatedRoute, private router: Router) {
    this.config = {
      type: Phaser.AUTO,
      pixelArt: true,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 }
        }
      },
      scale: {
        parent: 'gameContainer',
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 800,
        height: 600
    }
    };
  }

  ngOnInit() {
    this.route.queryParams.subscribe(data => {
      this.msc = new MainScene(this.regionService, this.router, data.id, this.range.value);
      this.config.scene = this.msc;
      this.phaserGame = new Phaser.Game(this.config);
    });

    this.regionService.getPartRegions(this.currentPage, this.pageLimit).subscribe((data: Region[]) => {
      this.regions = this.regions.concat(data);
    });
    this.currentPage++;
  }

  loadNextPage() {
    this.regionService.getPartRegions(this.currentPage, this.pageLimit).subscribe((data: Region[]) => {
      this.regions = this.regions.concat(data);
    });
    this.currentPage++;
  }

  goToRegion(region: Region){
    this.selectedRegion = region;
    this.msc.FetchRegions(region.x, region.y, this.range.value, true);
  }

  goToRegionRangeTrigger(){
    if (this.selectedRegion){
      this.msc.FetchRegions(this.selectedRegion.x, this.selectedRegion.y, this.range.value, false);
    }
  }
}

class MainScene extends Phaser.Scene {
  sprites: Phaser.GameObjects.Sprite[] = [];
  markerBox: Phaser.GameObjects.Rectangle;
  infoBox: Phaser.GameObjects.Text;
  infoButton: Phaser.GameObjects.Text;
  infoBackground: Phaser.GameObjects.Rectangle;
  tileSize = 32;
  cam: Cameras.Scene2D.Camera;
  cameraCursor: Phaser.GameObjects.Arc;
  pointerDownCoordinates: Phaser.Math.Vector2;
  startId: string;
  startRange: number;

  constructor(private regionService: RegionService, private router: Router, startId: string, startRange: number) {
    super({ key: 'main' });
    this.startId = startId;
    this.startRange = startRange;
  }

  preload() {
    this.load.spritesheet('worldTiles', 'assets/tiles/world_spritesheet.png', { frameWidth: 32, frameHeight: 32, endFrame: 3 });
  }

  create() {
    this.cam = this.cameras.main;
    this.cam.setZoom(2);
    this.input.on('pointermove', (p: any) => {
      if (!p.isDown){
        return;
      }
      this.cam.scrollX -= (p.x - p.prevPosition.x) / this.cam.zoom;
      this.cam.scrollY -= (p.y - p.prevPosition.y) / this.cam.zoom;
    });

    if (this.startId) {
      this.regionService.getRegionById(this.startId).subscribe((region: Region) => {
        this.FetchRegions(region.x, region.y, this.startRange, true);
      });
    }
  }

  FetchRegions(x: number, y: number, range: number, centerCamera: boolean){
    if (centerCamera){
      this.cam.scrollX = x * this.tileSize  - this.cam.width / 2;
      this.cam.scrollY = y * this.tileSize - this.cam.height / 2;
    }

    this.regionService.getRegionChunk(x, y, range).subscribe((data: Region[]) => {
      this.sprites.forEach(element => {
        element.destroy();
      });

      this.DrawMarkerBox(x * this.tileSize, y * this.tileSize);

      data.forEach(element => {
        let tileType: number;
        if (element.type === Type.water){
          tileType = 2;
        } else if (element.type === Type.sand) {
          tileType = 1;
        } else if (element.type === Type.grass || element.type === Type.snow) {
          tileType = 0;
        } else {
          tileType = 3;
        }
        const tmpSprite: Phaser.GameObjects.Sprite = this.add.sprite(element.x * this.tileSize,
                                                                    element.y * this.tileSize,
                                                                    'worldTiles',
                                                                    tileType);
        tmpSprite.setInteractive();
        tmpSprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          this.pointerDownCoordinates = new Phaser.Math.Vector2(pointer.x, pointer.y);
        });
        tmpSprite.on('pointerup', (pointer) => {
          if (this.pointerDownCoordinates.equals(new Phaser.Math.Vector2(pointer.x, pointer.y))){
            this.DrawInfoBox(element, range);
            this.DrawMarkerBox(element.x * this.tileSize, element.y * this.tileSize);
          }
        });

        tmpSprite.on('pointerover', (pointer) => {
          tmpSprite.setTint(0xff0000);
        });
        tmpSprite.on('pointerout', (pointer) => {
          tmpSprite.clearTint();
        });

        this.sprites.push(tmpSprite);
      });
    });
  }

  DrawInfoBox(region: Region, fetchRange: number){
    if (this.infoBox && this.infoButton && this.infoBackground) {
      this.infoBox.destroy();
      this.infoButton.destroy();
      this.infoBackground.destroy();
    }
    this.infoBox = this.add.text(
      region.x * this.tileSize,
      region.y * this.tileSize,
      'Loading...',
      { font: '16px monospace' });
    this.infoBox.depth = 11;

    this.regionService.getRegionById(region._id).subscribe((data: Region) => {
      this.infoBox.setText(
        [
          'Name: ' + data.name,
          'Type: ' + data.type,
          'X: ' + data.x.toString(),
          'Y: ' + data.y.toString(),
      ]);
      this.infoBox.setInteractive();
      this.infoBox.on('pointerup', (pointer) => {
        this.router.navigate(['/regions', region._id]);
      });

      this.infoButton = this.add.text(
        this.infoBox.getBottomLeft().x,
        this.infoBox.getBottomLeft().y,
        'Expand Map around ' + data.name);
      this.infoButton.setStyle(
        {
          font: '16px monospace',
          backgroundColor: '#3a3a99',
          fixedWidth: this.infoButton.getBottomRight().x - this.infoButton.getTopLeft().x,
          fixedHeight: this.infoButton.getBottomRight().y - this.infoButton.getTopLeft().y
        }
      );
      this.infoButton.depth = 11;
      this.infoButton.setInteractive();
      this.infoButton.on('pointerup', (pointer) => {
        this.FetchRegions(region.x, region.y, fetchRange, true);
      });


      let bottomX: number;
      if (this.infoBox.getTopRight().x > this.infoButton.getBottomRight().x) {
        bottomX = this.infoBox.getTopRight().x - this.infoBox.getTopLeft().x;
      } else {
        bottomX = this.infoButton.getBottomRight().x - this.infoBox.getTopLeft().x;
      }

      this.infoBackground = this.add.rectangle(
        this.infoBox.getTopLeft().x,
        this.infoBox.getTopLeft().y,
        bottomX,
        this.infoButton.getBottomRight().y - this.infoBox.getTopLeft().y,
        0x87918e,
        155
      );
      this.infoBackground.depth = 10;
      this.infoBackground.setOrigin(0);
    });
  }

  DrawMarkerBox(x: number, y: number){
    if (this.markerBox !== undefined) {
      this.markerBox.destroy();
    }

    this.markerBox = this.add.rectangle(x, y, this.tileSize, this.tileSize, 0xff0000);
    this.markerBox.depth = 9;
  }
}
